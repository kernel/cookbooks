# Skills used

Install once with `npx skills add kernel/skills`, then your coding agent knows the APIs this cookbook is built on.

| Skill | What it covers here |
| --- | --- |
| [kernel-vault](https://github.com/kernel/skills/tree/main/plugins/kernel-cli/skills/kernel-vault) | Per-user vault, connected wallet, card item scoped to the confirmed purchase, aliases handed to the agent, HITL approval observer, outcome verification |
| [kernel-regions](https://github.com/kernel/skills/tree/main/plugins/kernel-cli/skills/kernel-regions) | `region` on `browsers.create`, fanning out across `us-east` / `eu-west` / `ap-southeast`, pairing region with a matching-country proxy, shared concurrency |
| [kernel-agent-browser](https://github.com/kernel/skills/tree/main/plugins/kernel-cli/skills/kernel-agent-browser) | Selector strategy, waits and iframe handling when you swap `readQuote()` / `runCheckout()` for your own storefront, live view for the human confirmation step |

Also useful: `kernel-typescript-sdk` (server-side Playwright lifecycle, replays), `kernel-cli` (proxies and replays references).

Suggested prompt for your agent once the skills are installed:

> Adapt `readQuote()` and `runCheckout()` in `features/global-checkout-agent/index.ts` to `<storefront>`. Use the kernel-agent-browser skill to pick stable selectors, keep the vault alias handoff exactly as written, and do not add any retry around checkout submission.
