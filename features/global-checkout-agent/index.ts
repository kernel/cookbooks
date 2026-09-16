/**
 * Global Checkout Agent
 *
 * 1. Fan out one Kernel browser per region (us-east, eu-west, ap-southeast),
 *    each recording a replay and (optionally) egressing through a matching proxy.
 * 2. Price-check the same product on each regional storefront.
 * 3. Pick the cheapest, confirm the purchase with a human, freeze it.
 * 4. Create a Vault card item for exactly that purchase. The agent only ever
 *    receives payment aliases; the real card never enters the browser.
 * 5. Complete checkout once in the winning browser while a trusted observer
 *    watches the card item for approval actions and payment events.
 * 6. Stop replays, delete browsers, print a report with replay links.
 *
 * Everything marked `TODO` is storefront-specific and intentionally left for you.
 * API surface is verified against @onkernel/sdk 0.104.0 and kernel.sh/docs.
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
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`missing env ${name}`);
  return v;
}

const config = {
  projectID: env("KERNEL_PROJECT_ID"),
  vaultName: env("VAULT_NAME", "global-checkout-demo"),
  walletKey: env("WALLET_KEY", "agentcard-wallet"),
  provider: env("PAYMENT_PROVIDER", "agentcard") as "agentcard" | "link",
  // Storefront URLs for the same SKU, one per region. Fail closed if any is missing.
  storefronts: {
    "us-east": env("STOREFRONT_US_URL"),
    "eu-west": env("STOREFRONT_EU_URL"),
    "ap-southeast": env("STOREFRONT_AP_URL"),
  } satisfies Record<Region, string>,
  // Optional Kernel proxy IDs so the exit IP matches the storefront's market.
  proxies: {
    "us-east": process.env.PROXY_ID_US,
    "eu-west": process.env.PROXY_ID_EU,
    "ap-southeast": process.env.PROXY_ID_AP,
  } satisfies Record<Region, string | undefined>,
  // Non-card customer fields, collected from the end user, never invented by the agent.
  customer: {
    email: env("CHECKOUT_EMAIL"),
    billingName: env("CHECKOUT_BILLING_NAME"),
    postalCode: env("CHECKOUT_POSTAL_CODE"),
  },
  merchantName: env("MERCHANT_NAME"),
  dryRun: process.env.DRY_RUN === "true", // price-check only, no card, no checkout
  autoConfirm: process.env.AUTO_CONFIRM === "true", // skip the interactive confirmation (CI only)
  timeoutSeconds: Number(process.env.BROWSER_TIMEOUT_SECONDS ?? 1800),
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
  productName: string;
  amountMinor: number; // integer minor units, e.g. 2306 = 23.06
  currency: string; // ISO 4217 lowercase, e.g. "usd"
}

interface VerifiedPurchase extends PriceQuote {
  merchantName: string;
  confirmedAt: string;
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

async function priceCheck(b: RegionalBrowser): Promise<PriceQuote> {
  const url = config.storefronts[b.region];

  // Deterministic extraction with fixed selectors. This is the "trusted source"
  // for the purchase amount in this demo; in production prefer your order/cart
  // backend. Do not replace this with model inference.
  const response = await kernel.browsers.playwright.execute(b.sessionId, {
    code: `
      await page.goto(${JSON.stringify(url)}, { waitUntil: "domcontentloaded" });

      // TODO: replace these selectors with the storefront's product page selectors.
      const productName = (await page.locator("TODO_PRODUCT_NAME_SELECTOR").first().textContent())?.trim() ?? "";
      const priceText   = (await page.locator("TODO_PRICE_SELECTOR").first().textContent())?.trim() ?? "";
      // TODO: if the storefront exposes structured data (JSON-LD, meta[itemprop=price],
      // data-* attributes), prefer it over visible text.
      const currency    = (await page.locator("TODO_CURRENCY_SELECTOR").first().getAttribute("content")) ?? "";

      return { productName, priceText, currency, finalUrl: page.url() };
    `,
    timeout_sec: 90,
  });

  if (!response.success) {
    throw new Error(`[${b.region}] price check failed: ${response.error ?? response.stderr}`);
  }
  const r = response.result as { productName: string; priceText: string; currency: string; finalUrl: string };

  return {
    region: b.region,
    url: r.finalUrl,
    productName: r.productName,
    amountMinor: parseMinorUnits(r.priceText),
    currency: normalizeCurrency(r.currency),
  };
}

function parseMinorUnits(priceText: string): number {
  // TODO: adapt to the storefront's number format (e.g. "1.234,56 €" vs "$1,234.56").
  const cleaned = priceText.replace(/[^\d.,]/g, "").replace(/,/g, "");
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) throw new Error(`cannot parse price: ${priceText}`);
  return Math.round(value * 100);
}

function normalizeCurrency(raw: string): string {
  const c = raw.trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(c)) throw new Error(`cannot parse currency: ${raw}`);
  return c;
}

// ---------------------------------------------------------------------------
// Step 3: pick cheapest, confirm with a human, freeze
// ---------------------------------------------------------------------------

function pickCheapest(quotes: PriceQuote[]): PriceQuote {
  // TODO: if storefronts price in different currencies, convert to a common
  // currency here using a rate source you trust (and record the rate used).
  // This scaffold fails closed on mixed currencies instead of guessing.
  const currencies = new Set(quotes.map((q) => q.currency));
  if (currencies.size > 1) {
    throw new Error(`mixed currencies (${[...currencies].join(", ")}); add FX conversion in pickCheapest()`);
  }
  return [...quotes].sort((a, b) => a.amountMinor - b.amountMinor)[0]!;
}

async function confirmWithHuman(quote: PriceQuote): Promise<VerifiedPurchase> {
  console.log("\nCheapest offer:");
  console.log(`  region:   ${quote.region}`);
  console.log(`  product:  ${quote.productName}`);
  console.log(`  price:    ${(quote.amountMinor / 100).toFixed(2)} ${quote.currency.toUpperCase()}`);
  console.log(`  url:      ${quote.url}`);
  console.log(`  merchant: ${config.merchantName}`);

  if (!config.autoConfirm) {
    const rl = createInterface({ input: stdin, output: stdout });
    const answer = (await rl.question("\nBuy this? Type 'yes' to continue: ")).trim().toLowerCase();
    rl.close();
    if (answer !== "yes") throw new Error("purchase not confirmed; stopping before any card is created");
  }

  // Freeze. Everything downstream (card spec, prompt, reconciliation) derives from this object.
  return Object.freeze({ ...quote, merchantName: config.merchantName, confirmedAt: new Date().toISOString() });
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
    const pm = (wallet as VaultItem.WalletVaultItem).expanded?.payment_methods?.[0]; // TODO: let the user choose
    if (!pm) throw new Error("no Link payment methods available");

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
          `buy one "${purchase.productName}" from ${purchase.merchantName} (${purchase.region} storefront) ` +
          `for a total of ${(purchase.amountMinor / 100).toFixed(2)} ${purchase.currency.toUpperCase()}. ` +
          `this request is for this single purchase only and must not be repeated or retried.`,
      },
    });
    const created = await kernel.vaults.items.retrieve(cardKey, { id_or_name: vaultId });
    if (!created.available_operations.some((o) => o.type === "authorize")) throw new Error("authorize unavailable");
    const authorized = await kernel.vaults.items.performOperation(cardKey, { id_or_name: vaultId, type: "authorize" });
    if ("action" in authorized && authorized.action) presentAction(authorized.action, cardKey);
  }

  const card = await kernel.vaults.items.retrieve(cardKey, { id_or_name: vaultId, wait: 60 });
  if (card.type !== "card" || card.state.status !== "ready" || !card.state.aliases) {
    throw new Error(`card ${cardKey} is ${card.state.status}; not starting checkout`);
  }
  return { cardKey, aliases: card.state.aliases };
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
  } else {
    console.log(`  run in a trusted terminal:  kernel vaults items get ${config.vaultName} ${key} --open`);
  }
}

// ---------------------------------------------------------------------------
// Step 5: checkout + trusted observer
// ---------------------------------------------------------------------------

function observeCard(vaultId: string, cardKey: string, stop: AbortSignal) {
  let after: string | undefined;
  return (async () => {
    while (!stop.aborted) {
      const current = await kernel.vaults.items.retrieve(cardKey, { id_or_name: vaultId, wait: 5 });
      if (current.action) presentAction(current.action, cardKey);
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
  // The "agent" here is a fixed Playwright script. Swap in your browser agent and
  // pass the aliases + customer fields as structured task input (see README).
  // Rules: fill the merchant's normal card fields, answer any AI-agent disclosure
  // truthfully via the page's real checkbox, submit exactly once, never retry.
  const response = await kernel.browsers.playwright.execute(b.sessionId, {
    code: `
      // Assumes the product page from the price check is still open.
      // TODO: add-to-cart / go-to-checkout steps for this storefront.
      await page.locator("TODO_ADD_TO_CART_SELECTOR").click();
      await page.locator("TODO_CHECKOUT_BUTTON_SELECTOR").click();
      await page.waitForLoadState("domcontentloaded");

      // Customer fields (collected from the end user, passed in by the controller).
      await page.locator("TODO_EMAIL_SELECTOR").fill(${JSON.stringify(config.customer.email)});
      await page.locator("TODO_BILLING_NAME_SELECTOR").fill(${JSON.stringify(config.customer.billingName)});
      await page.locator("TODO_POSTAL_CODE_SELECTOR").fill(${JSON.stringify(config.customer.postalCode)});

      // Card fields. Many processors render these in an iframe; use frameLocator if so.
      // TODO: replace with the storefront's card field selectors / iframe.
      const card = page; // e.g. page.frameLocator("iframe[name^='__privateStripeFrame']")
      await card.locator("TODO_CARD_NUMBER_SELECTOR").fill(${JSON.stringify(aliases.number)});
      await card.locator("TODO_CARD_EXPIRY_SELECTOR").fill(${JSON.stringify(`${aliases.exp_month}/${aliases.exp_year.slice(-2)}`)});
      await card.locator("TODO_CARD_CVC_SELECTOR").fill(${JSON.stringify(aliases.cvc)});

      // Agent disclosure, if the checkout has one. Use the real input and verify it.
      const disclosure = page.locator("TODO_AI_AGENT_DISCLOSURE_CHECKBOX_SELECTOR");
      if (await disclosure.count()) {
        await disclosure.evaluate((el) => el.click());
        if (!(await disclosure.isChecked())) throw new Error("could not confirm agent disclosure; not submitting");
      }

      // Submit exactly once. Never retry, even on timeout or an unchanged page.
      await page.locator("TODO_PAY_BUTTON_SELECTOR").click();

      // For AgentCard the outgoing request is held until the cardholder approves,
      // so this wait can legitimately take a while. Keep the execution open.
      await page.waitForLoadState("networkidle", { timeout: 240_000 }).catch(() => {});
      return { url: page.url(), title: await page.title() };
    `,
    timeout_sec: 300,
  });

  if (!response.success) {
    // Do NOT resubmit. The payment may have gone through; reconcile first.
    console.error(`[${b.region}] checkout execution error (not retrying): ${response.error ?? response.stderr}`);
    return { indeterminate: true as const };
  }
  return { indeterminate: false as const, ...(response.result as { url: string; title: string }) };
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

  const browsers = await Promise.all(REGIONS.map((r) => createRegionalBrowser(r, vault.id)));
  const replayUrls = new Map<Region, string | undefined>();
  let outcome: Awaited<ReturnType<typeof runCheckout>> | undefined;
  let winner: RegionalBrowser | undefined;
  let purchase: VerifiedPurchase | undefined;
  let cardKey: string | undefined;

  try {
    // Price-check in parallel; a failed region is reported, not fatal.
    const settled = await Promise.allSettled(browsers.map(priceCheck));
    const quotes: PriceQuote[] = [];
    settled.forEach((s, i) => {
      if (s.status === "fulfilled") {
        quotes.push(s.value);
        console.log(`[${s.value.region}] ${s.value.productName}: ${(s.value.amountMinor / 100).toFixed(2)} ${s.value.currency.toUpperCase()}`);
      } else {
        console.warn(`[${browsers[i]!.region}] ${s.reason}`);
      }
    });
    if (quotes.length === 0) throw new Error("no storefront returned a price");

    const cheapest = pickCheapest(quotes);
    winner = browsers.find((b) => b.region === cheapest.region)!;

    // Release the losing browsers now; keep the winner (its replay keeps recording).
    for (const b of browsers) {
      if (b.region !== winner.region) replayUrls.set(b.region, await finalizeBrowser(b));
    }

    if (config.dryRun) {
      console.log("\nDRY_RUN=true: stopping after price check.");
      return;
    }

    purchase = await confirmWithHuman(cheapest);
    const wallet = await requireConnectedWallet(vault.id);
    const card = await createCardForPurchase(vault.id, wallet.key, purchase);
    cardKey = card.cardKey;
    if (winner.liveViewUrl) console.log(`\nWatch the checkout: ${winner.liveViewUrl}`);

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
    if (winner) replayUrls.set(winner.region, await finalizeBrowser(winner));

    console.log("\n=== Report ===");
    for (const r of REGIONS) console.log(`replay ${r}: ${replayUrls.get(r) ?? "(none)"}`);
    if (purchase) console.log(`purchase: ${purchase.productName} @ ${(purchase.amountMinor / 100).toFixed(2)} ${purchase.currency.toUpperCase()} via ${purchase.region}`);
    if (cardKey) console.log(`card item: ${config.vaultName}/${cardKey} (keep until reconciled with the merchant order)`);
    if (outcome) {
      console.log(outcome.indeterminate ? "checkout: INDETERMINATE. Reconcile before any new attempt." : `checkout page: ${outcome.title} (${outcome.url})`);
      console.log("The merchant order record is the authority on success, not the success page or card state.");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
