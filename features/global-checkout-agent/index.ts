/**
 * Global Checkout Agent
 *
 * 1. Fan out one Kernel browser per region (us-east, eu-west, ap-southeast),
 *    each recording a replay and (optionally) egressing through a matching proxy.
 * 2. Price-check the same checkout in each region. The reference storefront is a
 *    Stripe Payment Link with Adaptive Pricing, which quotes each visitor in their
 *    local currency (with an FX markup), so the price really differs by region.
 * 3. Normalize every quote to one currency with ECB reference rates, pick the
 *    cheapest, confirm the purchase with a human, freeze it.
 * 4. Create a Vault card item for exactly that purchase. The agent only ever
 *    receives payment aliases; the real card never enters the browser.
 * 5. Complete checkout once in the winning browser (the same one that verified
 *    the price) while a trusted observer watches the card item.
 * 6. Stop replays, delete browsers, print a report with replay links.
 *
 * API surface is verified against @onkernel/sdk 0.104.0 and kernel.sh/docs.
 * To use a different storefront, replace readQuote() and the selectors in
 * runCheckout(); everything else is storefront-agnostic.
 */

import Kernel from "@onkernel/sdk";
import type { VaultItem } from "@onkernel/sdk/resources/vaults/items";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type Region = "us-east" | "eu-west" | "ap-southeast";

const REGIONS: Region[] = ["us-east", "eu-west", "ap-southeast"];

function env(name: string, fallback?: string): string {
  const v = process.env[name] || fallback;
  if (v === undefined || v === "") throw new Error(`missing env ${name}`);
  return v;
}

const storefrontURL = env("STOREFRONT_URL");

const config = {
  projectID: env("KERNEL_PROJECT_ID"),
  vaultName: env("VAULT_NAME", "global-checkout-demo"),
  walletKey: env("WALLET_KEY", "link-wallet"),
  provider: env("PAYMENT_PROVIDER", "link") as "agentcard" | "link",
  // Same checkout in every region by default; override per region if your
  // storefront uses separate regional domains.
  storefronts: {
    "us-east": process.env.STOREFRONT_US_URL || storefrontURL,
    "eu-west": process.env.STOREFRONT_EU_URL || storefrontURL,
    "ap-southeast": process.env.STOREFRONT_AP_URL || storefrontURL,
  } satisfies Record<Region, string>,
  // Optional Kernel proxy IDs so the exit IP matches the storefront's market.
  proxies: {
    "us-east": process.env.PROXY_ID_US,
    "eu-west": process.env.PROXY_ID_EU,
    "ap-southeast": process.env.PROXY_ID_AP,
  } satisfies Record<Region, string | undefined>,
  // The merchant you expect. The run stops if the checkout names anyone else.
  expectedMerchant: env("MERCHANT_NAME"),
  // Quotes are compared in this currency using ECB reference rates.
  compareCurrency: env("COMPARE_CURRENCY", "usd").toLowerCase(),
  // Non-card customer fields, collected from the end user, never invented by the agent.
  customer: {
    email: env("CHECKOUT_EMAIL"),
    billingName: env("CHECKOUT_BILLING_NAME"),
    billingCountry: env("CHECKOUT_BILLING_COUNTRY", "US").toUpperCase(),
    postalCode: env("CHECKOUT_POSTAL_CODE"),
  },
  dryRun: process.env.DRY_RUN === "true", // price-check only, no card, no checkout
  autoConfirm: process.env.AUTO_CONFIRM === "true", // skip the interactive confirmation (CI only)
  approvalTimeoutSeconds: Number(process.env.APPROVAL_TIMEOUT_SECONDS || 600),
  timeoutSeconds: Number(process.env.BROWSER_TIMEOUT_SECONDS || 1800),
};

const kernel = new Kernel({ projectID: config.projectID, maxRetries: 0 });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegionalBrowser {
  region: Region;
  sessionId: string;
  replayId: string;
  liveViewUrl?: string;
}

interface PriceQuote {
  region: Region;
  url: string;
  merchantName: string;
  productName: string;
  amountMinor: number; // integer minor units of `currency`, e.g. 77 = 0.77 GBP
  currency: string; // ISO 4217 lowercase, e.g. "gbp"
  fxMarkupBps?: number; // merchant-side conversion markup, if the page reports one
}

interface NormalizedQuote extends PriceQuote {
  compareAmountMinor: number; // amount converted to config.compareCurrency
  ecbRate: number; // units of `currency` per 1 compareCurrency (1 when equal)
}

interface VerifiedPurchase extends PriceQuote {
  confirmedAt: string;
}

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------

function fractionDigits(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

function toMajor(amountMinor: number, currency: string): number {
  return amountMinor / 10 ** fractionDigits(currency);
}

function fmt(amountMinor: number, currency: string): string {
  return `${toMajor(amountMinor, currency).toFixed(fractionDigits(currency))} ${currency.toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Step 1: regional browsers with replays
// ---------------------------------------------------------------------------

async function createRegionalBrowser(region: Region, vaultId: string): Promise<RegionalBrowser> {
  const proxyId = config.proxies[region];
  const browser = await kernel.browsers.create({
    region,
    stealth: true,
    headless: false, // live view is useful during the HITL confirmation step
    timeout_seconds: config.timeoutSeconds,
    name: `global-checkout-${region}-${Date.now()}`,
    tags: { cookbook: "global-checkout-agent", region },
    // Vault attachment is immutable and must happen at creation. Attaching here
    // means whichever browser wins can complete checkout later.
    vaults: [{ id: vaultId }],
    ...(proxyId ? { proxy: { id: proxyId } } : {}),
  });

  const replay = await kernel.browsers.replays.start(browser.session_id, {
    max_duration_in_seconds: config.timeoutSeconds,
  });

  console.log(`[${region}] browser ${browser.session_id} (replay ${replay.replay_id})`);
  return {
    region,
    sessionId: browser.session_id,
    replayId: replay.replay_id,
    liveViewUrl: browser.browser_live_view_url,
  };
}

// ---------------------------------------------------------------------------
// Step 2: price check
// ---------------------------------------------------------------------------

/**
 * Stripe Payment Link: read the structured payment-link response the page itself
 * loads (merchant name, line items, active presentment total and currency) rather
 * than parsing display text. DOM text is only a supplemental check.
 * Swap this function out for your storefront's cart/order backend if you have one.
 */
async function readQuote(b: RegionalBrowser): Promise<PriceQuote> {
  const url = config.storefronts[b.region];
  const response = await kernel.browsers.playwright.execute(b.sessionId, {
    code: `
      // The checkout session (POST) carries line_item_group; the first GET does not.
      const [res] = await Promise.all([
        page.waitForResponse(
          async (r) =>
            /merchant-ui-api\\.stripe\\.com\\/payment-links\\//.test(r.url()) &&
            r.request().method() === "POST" &&
            r.status() === 200 &&
            Boolean((await r.json().catch(() => null))?.line_item_group),
          { timeout: 45000 },
        ),
        page.goto(${JSON.stringify(url)}, { waitUntil: "domcontentloaded" }),
      ]);
      const j = await res.json();
      const lig = j.line_item_group ?? {};
      const opts = j.adaptive_pricing_info?.local_currency_options ?? [];
      const active = opts.find((o) => o.currency === lig.currency);
      const summary = page.locator("[data-testid=checkout-container]").first();
      await summary.waitFor({ timeout: 20000 });
      return {
        merchantName: j.account_settings?.display_name ?? "",
        productName: (lig.line_items ?? []).map((li) => li.name).join(", "),
        lineItemCount: (lig.line_items ?? []).length,
        total: lig.total,
        currency: lig.currency,
        fxMarkupBps: active?.conversion_markup_bps ?? null,
        displayedText: (await summary.innerText()).replace(/\\s+/g, " "),
        finalUrl: page.url(),
      };
    `,
    timeout_sec: 90,
  });

  if (!response.success) {
    throw new Error(`[${b.region}] price check failed: ${response.error ?? response.stderr}`);
  }
  const r = response.result as {
    merchantName: string;
    productName: string;
    lineItemCount: number;
    total: number;
    currency: string;
    fxMarkupBps: number | null;
    displayedText: string;
    finalUrl: string;
  };

  if (!Number.isInteger(r.total) || r.total <= 0) throw new Error(`[${b.region}] no usable total`);
  if (!/^[a-z]{3}$/.test(r.currency ?? "")) throw new Error(`[${b.region}] no usable currency`);
  if (r.lineItemCount !== 1) throw new Error(`[${b.region}] expected one line item, got ${r.lineItemCount}`);
  if (r.merchantName !== config.expectedMerchant) {
    throw new Error(`[${b.region}] merchant is "${r.merchantName}", expected "${config.expectedMerchant}"`);
  }
  // Supplemental DOM check: the visible checkout must show the structured amount.
  const digits = toMajor(r.total, r.currency).toFixed(fractionDigits(r.currency));
  if (!r.displayedText.replace(/,/g, "").includes(digits)) {
    throw new Error(`[${b.region}] checkout does not show ${digits}; structured data and page disagree`);
  }

  return {
    region: b.region,
    url: r.finalUrl,
    merchantName: r.merchantName,
    productName: r.productName,
    amountMinor: r.total,
    currency: r.currency,
    fxMarkupBps: r.fxMarkupBps ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Step 3: normalize, pick cheapest, confirm with a human, freeze
// ---------------------------------------------------------------------------

/** ECB reference rates via frankfurter.dev: units of each currency per 1 `base`. */
async function fetchRates(base: string, currencies: string[]) {
  const symbols = [...new Set(currencies.filter((c) => c !== base))].map((c) => c.toUpperCase());
  if (symbols.length === 0) return { date: new Date().toISOString().slice(0, 10), rates: {} as Record<string, number> };
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base.toUpperCase()}&symbols=${symbols.join(",")}`);
  if (!res.ok) throw new Error(`FX rates unavailable (${res.status}); not comparing prices`);
  const body = (await res.json()) as { date: string; rates: Record<string, number> };
  return body;
}

async function normalize(quotes: PriceQuote[]): Promise<{ date: string; quotes: NormalizedQuote[] }> {
  const base = config.compareCurrency;
  const fx = await fetchRates(base, quotes.map((q) => q.currency));
  const normalized = quotes.map((q) => {
    const rate = q.currency === base ? 1 : fx.rates[q.currency.toUpperCase()];
    if (!rate) throw new Error(`no ECB rate for ${q.currency}; not comparing prices`);
    const inBase = toMajor(q.amountMinor, q.currency) / rate;
    return { ...q, ecbRate: rate, compareAmountMinor: Math.round(inBase * 10 ** fractionDigits(base)) };
  });
  return { date: fx.date, quotes: normalized };
}

function pickCheapest(quotes: NormalizedQuote[]): NormalizedQuote {
  // Ties go to the quote already in the compare currency (no FX exposure), then REGIONS order.
  return [...quotes].sort(
    (a, b) =>
      a.compareAmountMinor - b.compareAmountMinor ||
      Number(a.currency !== config.compareCurrency) - Number(b.currency !== config.compareCurrency) ||
      REGIONS.indexOf(a.region) - REGIONS.indexOf(b.region),
  )[0]!;
}

async function confirmWithHuman(quote: PriceQuote): Promise<VerifiedPurchase> {
  console.log("\nCheapest offer:");
  console.log(`  region:   ${quote.region}`);
  console.log(`  merchant: ${quote.merchantName}`);
  console.log(`  product:  ${quote.productName}`);
  console.log(`  price:    ${fmt(quote.amountMinor, quote.currency)}`);
  console.log(`  url:      ${quote.url}`);

  if (!config.autoConfirm) {
    const rl = createInterface({ input: stdin, output: stdout });
    const answer = (await rl.question("\nBuy this? Type 'yes' to continue: ")).trim().toLowerCase();
    rl.close();
    if (answer !== "yes") throw new Error("purchase not confirmed; stopping before any card is created");
  }

  // Freeze. Everything downstream (card spec, checkout check, report) derives from this object.
  return Object.freeze({ ...quote, confirmedAt: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// Step 4: Vault card for exactly this purchase
// ---------------------------------------------------------------------------

async function requireConnectedWallet(vaultId: string): Promise<VaultItem.WalletVaultItem> {
  const items = await kernel.vaults.items.list(vaultId);
  const wallets = items.filter(
    (i): i is VaultItem.WalletVaultItem => i.type === "wallet" && i.spec.provider === config.provider,
  );
  if (wallets.length !== 1) {
    throw new Error(
      `expected exactly one ${config.provider} wallet in vault ${config.vaultName}, found ${wallets.length}. ` +
        `Connect it first (see README "One-time setup"); this script never creates wallets.`,
    );
  }
  const wallet = wallets[0]!;
  if (wallet.state.status !== "connected") {
    throw new Error(`wallet ${wallet.key} is ${wallet.state.status}; resolve it outside this script`);
  }
  if (wallet.key !== config.walletKey) {
    throw new Error(`wallet key is ${wallet.key}, expected WALLET_KEY=${config.walletKey}`);
  }
  return wallet;
}

async function createCardForPurchase(vaultId: string, walletKey: string, purchase: VerifiedPurchase) {
  const cardKey = `order-${purchase.confirmedAt.replace(/[^0-9]/g, "").slice(0, 14)}`;

  if (config.provider === "agentcard") {
    await kernel.vaults.items.upsert(cardKey, {
      id_or_name: vaultId,
      type: "card",
      spec: {
        provider: "agentcard",
        wallet: walletKey,
        merchant: purchase.merchantName,
        amount: purchase.amountMinor,
        currency: purchase.currency,
        // card_id omitted: the cardholder picks an enrolled card on the approval screen.
      },
    });
  } else {
    // Link needs a payment method chosen by the end user and an explicit authorize step.
    const wallet = await kernel.vaults.items.retrieve(walletKey, { id_or_name: vaultId, expand: ["payment_methods"] });
    const methods = (wallet as VaultItem.WalletVaultItem).expanded?.payment_methods ?? [];
    const chosen = process.env.LINK_PAYMENT_METHOD_ID;
    const pm = chosen ? methods.find((m) => m.id === chosen) : methods.length === 1 ? methods[0] : undefined;
    if (!pm) {
      console.log("Link payment methods:");
      for (const m of methods) console.log(`  ${m.id}  ${m.display.brand ?? ""} ${m.display.last4 ?? ""}${m.is_default ? " (default)" : ""}`);
      throw new Error("set LINK_PAYMENT_METHOD_ID to the payment method the user chose");
    }

    await kernel.vaults.items.upsert(cardKey, {
      id_or_name: vaultId,
      type: "card",
      spec: {
        provider: "link",
        wallet: walletKey,
        payment_method_id: pm.id,
        amount: purchase.amountMinor,
        currency: purchase.currency,
        merchant_name: purchase.merchantName,
        merchant_url: purchase.url,
        context:
          `buy one "${purchase.productName}" from ${purchase.merchantName} via its ${purchase.region} checkout ` +
          `for a total of ${fmt(purchase.amountMinor, purchase.currency)}, chosen as the cheapest of three regional quotes. ` +
          `this request is for this single purchase only and must not be repeated or retried.`,
      },
    });
    const created = await kernel.vaults.items.retrieve(cardKey, { id_or_name: vaultId });
    if (!created.available_operations.some((o) => o.type === "authorize")) throw new Error("authorize unavailable");
    await kernel.vaults.items.performOperation(cardKey, { id_or_name: vaultId, type: "authorize" });
  }

  // Wait for the user to approve (Link spend approval) and the card to become ready.
  const deadline = Date.now() + config.approvalTimeoutSeconds * 1000;
  let shownAction: string | undefined;
  for (;;) {
    const card = await kernel.vaults.items.retrieve(cardKey, { id_or_name: vaultId, wait: 30 });
    if (card.type !== "card") throw new Error(`item ${cardKey} is not a card`);
    if (card.state.status === "ready" && card.state.aliases) return { cardKey, aliases: card.state.aliases };
    if (card.action && card.action.name !== shownAction) {
      presentAction(card.action, cardKey);
      shownAction = card.action.name;
    }
    const pending = ["requested", "pending_authorization", "pending_approval"].includes(card.state.status);
    if (!pending || Date.now() > deadline) {
      throw new Error(`card ${cardKey} is ${card.state.status}; not starting checkout`);
    }
  }
}

/**
 * The operator running this terminal is the trusted human. In a product, route
 * the action through your authenticated UI under an opaque, user-bound id and
 * never put the URL in logs or model context.
 */
function presentAction(action: VaultItem.CardVaultItem["action"] | VaultItem.WalletVaultItem["action"], key: string) {
  if (!action) return;
  console.log(`\nACTION REQUIRED (${action.name}) on item ${key}.`);
  if (process.env.PRINT_ACTION_URLS === "true" && "url" in action) {
    console.log(`  open in a browser you control: ${action.url}`);
  } else if ("url" in action) {
    console.log(`  run in a trusted terminal:  kernel vaults items get ${config.vaultName} ${key} --open`);
  } else {
    console.log("  approve it in the provider's app.");
  }
}

// ---------------------------------------------------------------------------
// Step 5: checkout + trusted observer
// ---------------------------------------------------------------------------

function observeCard(vaultId: string, cardKey: string, stop: AbortSignal) {
  let after: string | undefined;
  let shownAction: string | undefined;
  return (async () => {
    while (!stop.aborted) {
      const current = await kernel.vaults.items.retrieve(cardKey, { id_or_name: vaultId, wait: 5 });
      if (current.action && current.action.name !== shownAction) {
        presentAction(current.action, cardKey);
        shownAction = current.action.name;
      }
      const events = await kernel.vaults.items.events(cardKey, { id_or_name: vaultId, after, wait: 5 });
      for (const e of events) {
        console.log(`  [event] ${e.created_at} ${e.name}${e.browser_id ? ` browser=${e.browser_id}` : ""}`);
        after = e.id;
      }
    }
  })();
}

async function runCheckout(
  b: RegionalBrowser,
  purchase: VerifiedPurchase,
  aliases: { number: string; cvc: string; exp_month: string; exp_year: string },
) {
  // The "agent" here is a fixed Playwright script against Stripe Checkout. Swap in
  // your browser agent and pass the aliases + customer fields as structured task
  // input (see README). Rules: use the merchant's normal card fields, answer any
  // AI-agent disclosure truthfully, submit exactly once, never retry.
  const expiry = `${aliases.exp_month.padStart(2, "0")}${aliases.exp_year.slice(-2)}`;
  const expectedTotal = toMajor(purchase.amountMinor, purchase.currency).toFixed(fractionDigits(purchase.currency));
  const response = await kernel.browsers.playwright.execute(b.sessionId, {
    code: `
      // Same page that produced the verified quote. Re-check the total before paying.
      const shown = (await page.locator("[data-testid=checkout-container]").first().innerText()).replace(/,/g, "");
      if (!shown.includes(${JSON.stringify(expectedTotal)})) throw new Error("checkout no longer shows the confirmed total; not submitting");

      // Some markets show a payment-method accordion; open the card option if present.
      const cardTab = page.locator("[data-testid=card-accordion-item-button]");
      if (await cardTab.isVisible().catch(() => false)) await cardTab.click();

      await page.locator("#email").fill(${JSON.stringify(config.customer.email)});
      await page.locator("#cardNumber").click();
      await page.locator("#cardNumber").pressSequentially(${JSON.stringify(aliases.number)}, { delay: 30 });
      await page.locator("#cardExpiry").pressSequentially(${JSON.stringify(expiry)}, { delay: 30 });
      await page.locator("#cardCvc").pressSequentially(${JSON.stringify(aliases.cvc)}, { delay: 30 });
      await page.locator("#billingName").fill(${JSON.stringify(config.customer.billingName)});
      await page.locator("#billingCountry").selectOption(${JSON.stringify(config.customer.billingCountry)});
      const postal = page.locator("#billingPostalCode");
      if (await postal.isVisible().catch(() => false)) await postal.fill(${JSON.stringify(config.customer.postalCode)});

      // Don't enroll the end user in Link's "save my info" on their behalf.
      const save = page.locator("#enableStripePass");
      if (await save.isChecked().catch(() => false)) {
        await save.evaluate((el) => el.click());
        if (await save.isChecked()) throw new Error("could not untick save-my-info; not submitting");
      }

      // Submit exactly once. Never retry, even on timeout or an unchanged page.
      await page.locator("[data-testid=hosted-payment-submit-button]").click();

      const errorBox = page.locator(".FieldError, [role=alert]").filter({ hasText: /./ }).first();
      const done = await Promise.race([
        page.getByText(/thanks for your payment|payment successful/i).first().waitFor({ timeout: 240000 }).then(() => "success_page"),
        errorBox.waitFor({ timeout: 240000 }).then(async () => "error: " + (await errorBox.innerText())),
      ]).catch(() => "timeout");
      return { url: page.url(), title: await page.title(), result: done };
    `,
    timeout_sec: 300,
  });

  if (!response.success) {
    // Do NOT resubmit. The payment may have gone through; reconcile first.
    console.error(`[${b.region}] checkout execution error (not retrying): ${response.error ?? response.stderr}`);
    return { indeterminate: true as const };
  }
  const r = response.result as { url: string; title: string; result: string };
  return { indeterminate: r.result !== "success_page", ...r };
}

// ---------------------------------------------------------------------------
// Step 6: teardown + report
// ---------------------------------------------------------------------------

async function finalizeBrowser(b: RegionalBrowser): Promise<string | undefined> {
  try {
    await kernel.browsers.replays.stop(b.replayId, { id_or_name: b.sessionId });
    const replays = await kernel.browsers.replays.list(b.sessionId);
    return replays.find((r) => r.replay_id === b.replayId)?.replay_view_url;
  } catch (err) {
    console.warn(`[${b.region}] replay finalize failed: ${(err as Error).message}`);
    return undefined;
  } finally {
    await kernel.browsers.deleteByID(b.sessionId).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Global Checkout Agent: ${REGIONS.join(", ")} | provider=${config.provider} | dryRun=${config.dryRun}`);

  // Vault first: browsers need its id at creation.
  const vault = await kernel.vaults.upsert({ name: config.vaultName });
  if (!config.dryRun) await requireConnectedWallet(vault.id); // fail fast before spending browser time

  const settledBrowsers = await Promise.allSettled(REGIONS.map((r) => createRegionalBrowser(r, vault.id)));
  const browsers = settledBrowsers.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  const replayUrls = new Map<Region, string | undefined>();
  const finalized = new Set<Region>();
  const release = async (b: RegionalBrowser) => {
    if (finalized.has(b.region)) return;
    finalized.add(b.region);
    replayUrls.set(b.region, await finalizeBrowser(b));
  };
  if (browsers.length < REGIONS.length) {
    await Promise.all(browsers.map(release));
    const failed = settledBrowsers.flatMap((s) => (s.status === "rejected" ? [String(s.reason)] : []));
    throw new Error(`could not create every regional browser: ${failed.join("; ")}`);
  }
  let outcome: Awaited<ReturnType<typeof runCheckout>> | undefined;
  let winner: RegionalBrowser | undefined;
  let purchase: VerifiedPurchase | undefined;
  let cardKey: string | undefined;

  try {
    // Price-check in parallel; a failed region is reported, not fatal.
    const settled = await Promise.allSettled(browsers.map(readQuote));
    const quotes: PriceQuote[] = [];
    settled.forEach((s, i) => {
      if (s.status === "fulfilled") quotes.push(s.value);
      else console.warn(`[${browsers[i]!.region}] ${s.reason}`);
    });
    if (quotes.length === 0) throw new Error("no region returned a price");

    const { date, quotes: normalized } = await normalize(quotes);
    console.log(`\nQuotes (compared in ${config.compareCurrency.toUpperCase()} at ECB rates of ${date}):`);
    for (const q of normalized) {
      const markup = q.fxMarkupBps ? `, merchant FX markup ${(q.fxMarkupBps / 100).toFixed(1)}%` : "";
      console.log(
        `  ${q.region.padEnd(13)} ${fmt(q.amountMinor, q.currency).padStart(12)}  ~ ${fmt(q.compareAmountMinor, config.compareCurrency)}` +
          `  (ECB 1 ${config.compareCurrency.toUpperCase()} = ${q.ecbRate} ${q.currency.toUpperCase()}${markup})`,
      );
    }

    const cheapest = pickCheapest(normalized);
    winner = browsers.find((b) => b.region === cheapest.region)!;
    console.log(`\nCheapest: ${cheapest.region}`);

    // Release the losing browsers now; keep the winner (its replay keeps recording).
    await Promise.all(browsers.filter((b) => b.region !== winner!.region).map(release));

    if (config.dryRun) {
      console.log("\nDRY_RUN=true: stopping after price check.");
      return;
    }

    const { compareAmountMinor: _c, ecbRate: _r, ...quote } = cheapest;
    purchase = await confirmWithHuman(quote);
    const wallet = await requireConnectedWallet(vault.id);
    if (winner.liveViewUrl && process.env.PRINT_LIVE_VIEW === "true") console.log(`\nWatch the checkout: ${winner.liveViewUrl}`);
    const card = await createCardForPurchase(vault.id, wallet.key, purchase);
    cardKey = card.cardKey;

    const stop = new AbortController();
    const observer = observeCard(vault.id, cardKey, stop.signal);
    try {
      outcome = await runCheckout(winner, purchase, card.aliases);
      // Give the observer a window to surface terminal events. Tune for your merchant.
      await new Promise((r) => setTimeout(r, 15_000));
    } finally {
      stop.abort();
      await observer.catch(() => {});
    }
  } finally {
    // Winner (or every browser, if we failed before picking one).
    await Promise.all(browsers.map(release));

    console.log("\n=== Report ===");
    for (const r of REGIONS) console.log(`replay ${r}: ${replayUrls.get(r) ?? "(none)"}`);
    if (purchase) console.log(`purchase: ${purchase.productName} from ${purchase.merchantName} @ ${fmt(purchase.amountMinor, purchase.currency)} via ${purchase.region}`);
    if (cardKey) console.log(`card item: ${config.vaultName}/${cardKey} (keep until reconciled with the merchant order)`);
    if (outcome) {
      console.log(
        outcome.indeterminate
          ? `checkout: INDETERMINATE${"result" in outcome ? ` (${outcome.result})` : ""}. Reconcile before any new attempt.`
          : `checkout: success page shown (${outcome.url})`,
      );
      console.log("The merchant's payment record is the authority on success, not the success page or card state.");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
