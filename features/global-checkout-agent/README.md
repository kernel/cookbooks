# Global Checkout Agent

Three Kernel browsers, one in each region (`us-east`, `eu-west`, `ap-southeast`), price-check the same checkout. The cheapest region wins and completes the purchase with a card from Kernel Vault. The agent only ever sees payment aliases; the real card number never enters the browser. Every browser records a replay so you can watch what happened in each market.

Features shown: [Regional Browsers](https://www.kernel.sh/docs/browsers/regions), [Vault](https://www.kernel.sh/docs/vaults/overview) (payments), [Replays](https://www.kernel.sh/docs/browsers/replays), and optionally [Proxies](https://www.kernel.sh/docs/proxies/overview).

**Skills used:** [kernel-vault](https://github.com/kernel/skills/tree/main/plugins/kernel-cli/skills/kernel-vault), [kernel-regions](https://github.com/kernel/skills/tree/main/plugins/kernel-cli/skills/kernel-regions), [kernel-agent-browser](https://github.com/kernel/skills/tree/main/plugins/kernel-cli/skills/kernel-agent-browser). See [SKILLS.md](SKILLS.md).

The reference storefront is a public $1.00 Stripe Payment Link with [Adaptive Pricing](https://docs.stripe.com/payments/checkout/adaptive-pricing), so each region really gets a different price. A dry run looks like this:

```
Quotes (compared in USD at ECB rates of 2026-09-15):
  us-east           1.00 USD  ~ 1.00 USD  (ECB 1 USD = 1 USD)
  eu-west           0.77 GBP  ~ 1.04 USD  (ECB 1 USD = 0.74166 GBP, merchant FX markup 4.0%)
  ap-southeast      1.32 SGD  ~ 1.04 USD  (ECB 1 USD = 1.2725 SGD, merchant FX markup 4.0%)

Cheapest: us-east
```

## What it does

```
                 ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  create + replay│  us-east     │  │  eu-west     │  │ ap-southeast │
  (vault attached│  + US proxy  │  │  + EU proxy  │  │  + SG proxy  │
   to all three) └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
                        │ price            │ price           │ price
                        └────────┬─────────┴─────────┬───────┘
                                 ▼                   │
                       pick cheapest, show human,    │ losers: stop replay,
                       confirm, FREEZE purchase      │ delete browser
                                 ▼
                       Vault: require connected wallet
                              create card item for exactly this purchase
                              wait for `ready`, read aliases
                                 ▼
                 winner browser: fill checkout with aliases, submit ONCE
                 observer (outside the agent): actions + payment events
                                 ▼
                 stop replay, delete browser, print replay links + outcome
```

1. **Vault first.** `kernel.vaults.upsert({ name })` creates or fetches the per-user vault. Its id is needed before any browser exists because vault attachment is fixed at browser creation.
2. **Fan out.** `kernel.browsers.create({ region, vaults: [{ id }], proxy?: { id } })` once per region, then `kernel.browsers.replays.start(session_id)`. All three get the vault so whichever one wins can pay.
3. **Price-check** with `kernel.browsers.playwright.execute()`. For a Stripe Payment Link the script reads the structured payment-link response the page loads (`account_settings.display_name`, `line_item_group.total`, `line_item_group.currency`, line items) and uses the visible checkout only as a cross-check. It stops if the merchant isn't `MERCHANT_NAME`. Quotes are converted to `COMPARE_CURRENCY` at ECB reference rates from [frankfurter.dev](https://frankfurter.dev), and the rates are printed.
4. **Confirm and freeze.** The cheapest offer is printed; you type `yes`. The frozen purchase object is the only source for the card spec.
5. **Card item.** Exactly one `connected` wallet for the chosen provider must already exist in the vault (this script never creates wallets). An AgentCard card is `upsert`ed with `merchant`, `amount` (minor units), `currency`; a Link card additionally gets `payment_method_id`, `merchant_url`, `context` and an `authorize` step. The script waits for `state.status === "ready"` and reads `state.aliases`.
6. **Checkout.** The winning browser (the same one that verified the price, so location-based pricing can't change underneath you) re-checks the total, dismisses Stripe's Link sign-in prompt if the email has a Link account (the agent never signs in to the user's wallet), fills the merchant's normal card fields with the aliases plus your separately supplied customer fields, answers any AI-agent disclosure via the page's real checkbox, and submits once. Meanwhile an observer polls the card item (`retrieve` with `wait`, `events` with `after`) and surfaces any approval action to you, the trusted human. For AgentCard the outgoing request is held until you approve.
7. **Report.** Replays are stopped and listed (`replay_view_url`), browsers deleted, and the purchase, card key and checkout page are printed. The merchant's order record is the authority on success; the script tells you so.

## Prerequisites

- Node 20+ and a Kernel account on a **Start-Up or Enterprise** plan (regional browsers), with a paid plan if you attach proxies.
- `KERNEL_API_KEY` and `KERNEL_PROJECT_ID`. Vaults are project-owned.
- Kernel CLI for the one-time wallet setup: `npm i -g @onkernel/cli` (or `brew install kernel/tap/kernel`).
- A connected Link or AgentCard wallet (below). Link is live-only, so a full run is a **real $1.00 charge** to Kernel Technologies, Inc. Use `npm run dry-run` for everything else.
- To use your own storefront: a low-value checkout you control whose payment request matches a native Kernel processor adapter (Stripe, Shopify, Square, Recurly, Razorpay request formats today).

## One-time setup: connect the wallet

Do this from a terminal you operate, not from the agent. The output can contain a provider action URL that only you should see.

```bash
export KERNEL_API_KEY=... KERNEL_PROJECT_ID=...
kernel vaults create --name global-checkout-demo

# Link by Stripe (Kernel-managed OAuth)
kernel vaults wallets create global-checkout-demo link-wallet \
  --provider link --spec '{"authorization":{"method":"oauth","client":{"type":"kernel_managed"}}}' --open
kernel vaults items get global-checkout-demo link-wallet --wait 60
# -> state.status must be "connected"
```

For AgentCard use `--provider agentcard --spec '{}'`, `WALLET_KEY=agentcard-wallet` and `PAYMENT_PROVIDER=agentcard`; sandbox vs live is set by the credential (see the [AgentCard guide](https://www.kernel.sh/docs/integrations/payments/agentcard)). Keep exactly one wallet per provider in the vault.

Optional proxies so each region's exit IP matches its market:

```bash
kernel proxies create --type residential --country US --name "US Residential" -o json | jq -r .id   # PROXY_ID_US
kernel proxies create --type residential --country DE --name "DE Residential" -o json | jq -r .id   # PROXY_ID_EU
kernel proxies create --type residential --country SG --name "SG Residential" -o json | jq -r .id   # PROXY_ID_AP
```

## Run

```bash
cd features/global-checkout-agent
npm install
cp .env.example .env    # project id, vault, customer fields
```

```bash
npm run dry-run   # price-check all three regions, no card, no checkout, no charge
npm start         # full flow: you confirm in the terminal, then approve the spend request in Link
```

`npm run typecheck` verifies the scaffold against the SDK types.

## Environment

| Variable | Purpose |
| --- | --- |
| `KERNEL_API_KEY`, `KERNEL_PROJECT_ID` | Auth and project scope (vault and browsers must share a project) |
| `VAULT_NAME` | Per-user vault name, created if missing |
| `WALLET_KEY`, `PAYMENT_PROVIDER` | Existing connected wallet item and its provider (`link` or `agentcard`) |
| `LINK_PAYMENT_METHOD_ID` | Link only: the payment method the user chose (required if the wallet has more than one) |
| `APPROVAL_TIMEOUT_SECONDS` | How long to wait for the spend approval (default 600) |
| `STOREFRONT_URL` | Checkout to price and buy in every region |
| `STOREFRONT_US_URL`, `STOREFRONT_EU_URL`, `STOREFRONT_AP_URL` | Optional per-region overrides |
| `MERCHANT_NAME` | Expected merchant; the run stops on a mismatch |
| `COMPARE_CURRENCY` | Currency quotes are compared in (default `usd`) |
| `PROXY_ID_US`, `PROXY_ID_EU`, `PROXY_ID_AP` | Optional Kernel proxy ids per region |
| `CHECKOUT_EMAIL`, `CHECKOUT_BILLING_NAME`, `CHECKOUT_BILLING_COUNTRY`, `CHECKOUT_POSTAL_CODE` | Customer fields, supplied by the end user |
| `DRY_RUN` | `true` = price-check only |
| `AUTO_CONFIRM` | `true` = skip the interactive confirmation (CI only) |
| `PRINT_ACTION_URLS` | `true` = print provider action URLs to this terminal instead of the `kernel vaults items get --open` command |
| `PRINT_LIVE_VIEW` | `true` = print the winning browser's live view URL |

## Safety rules baked in

- The card spec is derived only from the frozen, human-confirmed purchase object, never from what the page or an agent proposes later.
- Wallets are never created by the script; a missing or non-`connected` wallet stops the run before any browser is created.
- The merchant name comes from the checkout's structured data and must match `MERCHANT_NAME`; the total is re-checked in the same browser right before submit.
- The script unticks Stripe's "save my information" box rather than enrolling the end user in Link on their behalf.
- Checkout is submitted once. Execution errors and timeouts are reported as **indeterminate**, not retried. Reconcile against the merchant order before trying again.
- Provider action URLs are bearer links. By default the script prints the CLI command to open them rather than the URL.
- Live view URLs and CDP URLs are not written to logs beyond the operator's terminal.

## Adapting it

- **Swap the fixed Playwright script for an agent.** Pass `aliases` and the customer fields as structured task input, keep the observer running, and keep the "submit once" instruction. The [payments guide](https://www.kernel.sh/docs/browsers/enable-payments-in-browser-agent#4-give-the-aliases-to-your-agent) has a prompt template.
- **Your own storefront.** Replace `readQuote()` (prefer your cart or order backend as the trusted source) and the selectors in `runCheckout()`. Everything else is storefront-agnostic.
- **Pin each region's market.** Stealth browsers use Kernel's default proxy, whose exit country usually but not always matches the region. Set `PROXY_ID_US/EU/AP` to country proxies when the price must come from a specific market.
- **Different regions per storefront.** Edit `REGIONS` and the `storefronts`/`proxies` maps.
- **AgentCard instead of Link.** Set `PAYMENT_PROVIDER=agentcard`; the card item is reusable and each checkout is approved by the cardholder.

## Resources

- [Regional Browsers](https://www.kernel.sh/docs/browsers/regions)
- [Vaults overview](https://www.kernel.sh/docs/vaults/overview), [Enable payments in a browser agent](https://www.kernel.sh/docs/browsers/enable-payments-in-browser-agent)
- [AgentCard](https://www.kernel.sh/docs/integrations/payments/agentcard), [Link by Stripe](https://www.kernel.sh/docs/integrations/payments/stripe-link), [processor coverage](https://www.kernel.sh/docs/integrations/payments/overview#checkout-and-processor-coverage)
- [Replays](https://www.kernel.sh/docs/browsers/replays), [Proxies](https://www.kernel.sh/docs/proxies/overview)
- [Kernel skills](https://github.com/kernel/skills)
