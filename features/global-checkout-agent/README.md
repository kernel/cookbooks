# Global Checkout Agent

Three Kernel browsers, one in each region (`us-east`, `eu-west`, `ap-southeast`), price-check the same product on its regional storefront. The cheapest region wins and completes the purchase with a card from Kernel Vault. The agent only ever sees payment aliases; the real card number never enters the browser. Every browser records a replay so you can watch what happened in each market.

Features shown: [Regional Browsers](https://www.kernel.sh/docs/browsers/regions), [Vault](https://www.kernel.sh/docs/vaults/overview) (payments), [Replays](https://www.kernel.sh/docs/browsers/replays), and optionally [Proxies](https://www.kernel.sh/docs/proxies/overview).

**Skills used:** [kernel-vault](https://github.com/kernel/skills/tree/main/plugins/kernel-cli/skills/kernel-vault), [kernel-regions](https://github.com/kernel/skills/tree/main/plugins/kernel-cli/skills/kernel-regions), [kernel-agent-browser](https://github.com/kernel/skills/tree/main/plugins/kernel-cli/skills/kernel-agent-browser). See [SKILLS.md](SKILLS.md).

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
3. **Price-check** with `kernel.browsers.playwright.execute()` using fixed selectors (deterministic extraction is the trusted source in this demo; in production use your order backend). Mixed currencies fail closed until you add FX in `pickCheapest()`.
4. **Confirm and freeze.** The cheapest offer is printed; you type `yes`. The frozen purchase object is the only source for the card spec.
5. **Card item.** Exactly one `connected` wallet for the chosen provider must already exist in the vault (this script never creates wallets). An AgentCard card is `upsert`ed with `merchant`, `amount` (minor units), `currency`; a Link card additionally gets `payment_method_id`, `merchant_url`, `context` and an `authorize` step. The script waits for `state.status === "ready"` and reads `state.aliases`.
6. **Checkout.** The winning browser fills the merchant's normal card fields with the aliases plus your separately supplied customer fields, answers any AI-agent disclosure via the page's real checkbox, and submits once. Meanwhile an observer polls the card item (`retrieve` with `wait`, `events` with `after`) and surfaces any approval action to you, the trusted human. For AgentCard the outgoing request is held until you approve.
7. **Report.** Replays are stopped and listed (`replay_view_url`), browsers deleted, and the purchase, card key and checkout page are printed. The merchant's order record is the authority on success; the script tells you so.

## Prerequisites

- Node 20+ and a Kernel account on a **Start-Up or Enterprise** plan (regional browsers), with a paid plan if you attach proxies.
- `KERNEL_API_KEY` and `KERNEL_PROJECT_ID`. Vaults are project-owned.
- Kernel CLI for the one-time wallet setup: `npm i -g @onkernel/cli` (or `brew install kernel/tap/kernel`).
- Three storefront URLs for the same product whose checkout uses a processor Kernel can hand off to natively (Stripe, Shopify, Square, Recurly, Razorpay request formats today). Use a low-value checkout you control while filling in the selectors.

## One-time setup: connect the wallet

Do this from a terminal you operate, not from the agent. The output can contain a provider action URL that only you should see.

```bash
export KERNEL_API_KEY=... KERNEL_PROJECT_ID=...
kernel vaults create --name global-checkout-demo

# AgentCard (Kernel-managed credentials; sandbox vs live is set by the credential)
kernel vaults wallets create global-checkout-demo agentcard-wallet \
  --provider agentcard --spec '{}' --open
kernel vaults items get global-checkout-demo agentcard-wallet --wait 60
# -> state.status must be "connected"
```

For Link by Stripe use `--provider link` and `WALLET_KEY=link-wallet`; see the [Link guide](https://www.kernel.sh/docs/integrations/payments/stripe-link). Keep exactly one wallet per provider in the vault.

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
cp .env.example .env    # fill in URLs, project id, customer fields
```

Fill in the `TODO_*` selectors in [index.ts](index.ts) for your storefront (product name, price, currency, add-to-cart, checkout, customer fields, card fields/iframe, pay button, disclosure checkbox). The `kernel-agent-browser` skill has the selector strategy.

```bash
npm run dry-run   # price-check all three regions, no card, no checkout
npm start         # full flow; you confirm the purchase in the terminal
```

`npm run typecheck` verifies the scaffold against the SDK types.

## Environment

| Variable | Purpose |
| --- | --- |
| `KERNEL_API_KEY`, `KERNEL_PROJECT_ID` | Auth and project scope (vault and browsers must share a project) |
| `VAULT_NAME` | Per-user vault name, created if missing |
| `WALLET_KEY`, `PAYMENT_PROVIDER` | Existing connected wallet item and its provider (`agentcard` or `link`) |
| `MERCHANT_NAME` | Shown on the approval screen / used as Link `merchant_name` |
| `STOREFRONT_US_URL`, `STOREFRONT_EU_URL`, `STOREFRONT_AP_URL` | Same SKU, one URL per region |
| `PROXY_ID_US`, `PROXY_ID_EU`, `PROXY_ID_AP` | Optional Kernel proxy ids per region |
| `CHECKOUT_EMAIL`, `CHECKOUT_BILLING_NAME`, `CHECKOUT_POSTAL_CODE` | Customer fields, supplied by the end user |
| `DRY_RUN` | `true` = price-check only |
| `AUTO_CONFIRM` | `true` = skip the interactive confirmation (CI only) |
| `PRINT_ACTION_URLS` | `true` = print provider action URLs to this terminal instead of the `kernel vaults items get --open` command |

## Safety rules baked in

- The card spec is derived only from the frozen, human-confirmed purchase object, never from what the page or an agent proposes later.
- Wallets are never created by the script; a missing or non-`connected` wallet stops the run before any browser is created.
- Checkout is submitted once. Execution errors and timeouts are reported as **indeterminate**, not retried. Reconcile against the merchant order before trying again.
- Provider action URLs are bearer links. By default the script prints the CLI command to open them rather than the URL.
- Live view URLs and CDP URLs are not written to logs beyond the operator's terminal.

## Adapting it

- **Swap the fixed Playwright script for an agent.** Pass `aliases` and the customer fields as structured task input, keep the observer running, and keep the "submit once" instruction. The [payments guide](https://www.kernel.sh/docs/browsers/enable-payments-in-browser-agent#4-give-the-aliases-to-your-agent) has a prompt template.
- **Different regions per storefront.** Edit `REGIONS` and the `storefronts`/`proxies` maps.
- **Mixed currencies.** Implement conversion in `pickCheapest()` with a rate source you trust and log the rate in the report.
- **Link instead of AgentCard.** Set `PAYMENT_PROVIDER=link`; the script lists the wallet's `payment_methods` expansion and authorizes before checkout.

## Resources

- [Regional Browsers](https://www.kernel.sh/docs/browsers/regions)
- [Vaults overview](https://www.kernel.sh/docs/vaults/overview), [Enable payments in a browser agent](https://www.kernel.sh/docs/browsers/enable-payments-in-browser-agent)
- [AgentCard](https://www.kernel.sh/docs/integrations/payments/agentcard), [Link by Stripe](https://www.kernel.sh/docs/integrations/payments/stripe-link), [processor coverage](https://www.kernel.sh/docs/integrations/payments/overview#checkout-and-processor-coverage)
- [Replays](https://www.kernel.sh/docs/browsers/replays), [Proxies](https://www.kernel.sh/docs/proxies/overview)
- [Kernel skills](https://github.com/kernel/skills)
