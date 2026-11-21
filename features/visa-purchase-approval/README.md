# hosted visa purchase approval

a small typescript / bun app that creates a purchase with an existing KERNEL wallet, opens its hosted visa approval page, and waits for checkout readiness. the api key stays on the server. the traveller reviews the merchant and amount, completes any verification visa requests, and explicitly approves the purchase.

this sample stops before browser fill or merchant submission. it does not place an order or charge a card.

## prerequisites

- [bun](https://bun.sh/) 1.2 or later.
- a KERNEL api key and an existing vault, `provider: "kernel"` wallet, and active, eligible visa payment method with a network token. see [pay with card](https://www.kernel.sh/docs/integrations/wallets/pay-with-card) for enrollment. keep card details out of this app.
- a browser that supports the verification requested by visa. the hosted page can require a passkey or a one-time code; the sequence varies by card and session.

## run

```sh
git clone https://github.com/kernel/cookbooks.git
cd cookbooks/features/visa-purchase-approval
cp .env.example .env
```

set these values in `.env`:

- `KERNEL_API_KEY`: your server-side api key.
- `KERNEL_PROJECT_ID`: the project containing the vault, if needed.
- `KERNEL_VAULT`: the vault's id or name.
- `KERNEL_WALLET`: the existing wallet item's key.
- `KERNEL_PAYMENT_METHOD_ID`: the visa method id from the wallet's `payment_methods` expansion.

```sh
bun start
```

open `http://127.0.0.1:3006`. no dependency installation is needed. without wallet configuration, the page shows setup instructions and cannot request authorization.

the example purchase is $48.00 usd at `https://shop.example.com/checkout`. review the server-owned purchase details in `server.ts` before requesting approval. use your configured test environment and test payment method for experimentation. with a live wallet, requesting approval starts a real purchase authorization, even though this sample never submits checkout.

1. click **request purchase approval** once. the server creates one card item and invokes its advertised `authorize` operation.
2. click **open hosted approval**. the returned `spend_approval` url opens unchanged in a new tab, without an opener or referrer. follow the hosted verification and consent steps.
3. return to the sample. it polls the same purchase and reports ready only when the card has available funding, an unexpired `expires_at`, and an advertised `fill` operation. your browser controller could now fill and submit the seller's checkout before expiry.

approval is separate from merchant payment. verify the merchant's order record after submitting a real checkout; neither an approved page nor a completed fill proves a charge.

## what the sample demonstrates

- `PUT /vaults/{vault}/items/{key}` creates a card item with a wallet, payment method, amount, currency, merchant url and merchant country.
- `POST …/operations` invokes `{ "type": "authorize" }` only when advertised.
- `GET …?wait=10` retrieves the existing purchase without repeating authorization.
- only a `spend_approval` action at `https://vault.kernel.sh/card-approval` is offered as hosted visa approval. the `/card-cvc` action is a separate alias-mode flow, even though it shares the action name. a custom KERNEL vault origin requires updating that origin check in `app.ts`.
- expired, declined, consumed, recovery-required or unavailable-funding purchases do not become ready. unknown requests are not automatically repeated.

one process holds one purchase key in memory, including after a failed request. if authorization has an uncertain result, use **check status** and reconcile the existing purchase before doing anything else. do not restart the server to bypass that state. for a new, deliberately approved test purchase, reconcile and remove the earlier item through the vault api first, then restart.

## adapting it

this is a single-user, loopback-only example. before hosting it, add authenticated per-user purchase ownership, durable purchase keys, and protection against duplicate checkout attempts. keep purchase details under your controller's authority. deliver approval capabilities only to the intended cardholder, outside the agent context; do not log them or save them in browser storage or analytics.

for the browser fill and submission steps, see [enable payments in a browser agent](https://www.kernel.sh/docs/browsers/enable-payments-in-browser-agent).

## validation

```sh
bun test
```

the tests exercise the local app over http with a test api, including hosted approval, readiness, uncertain authorization and cross-origin rejection. they do not enroll a card, run real visa authentication or verify merchant acceptance.
