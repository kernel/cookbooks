# e2e + KERNEL

Run an agentic end-to-end test in a hosted KERNEL browser with
[e2e](https://e2e.tester.army/docs).

The example opens the [browser session API reference][browser-session-docs], asks
an agent to find the section explaining browser creation, and verifies the
resulting heading with a locator assertion.

[browser-session-docs]: https://www.kernel.sh/docs/api-reference/browsers/create-a-browser-session

## Prerequisites

- Node.js 22.12 or newer
- a [KERNEL API key](https://dashboard.onkernel.com/sign-in)
- an [OpenAI API key](https://platform.openai.com/api-keys)

## Setup

```bash
cp .env.example .env
npm install
npm test
```

Set `KERNEL_API_KEY` and `OPENAI_API_KEY` in `.env`. `DOCS_URL` defaults to
`https://www.kernel.sh` and can be changed to another publicly reachable site.

## Extend the test

Edit `tests/smoke.e2e.ts` to add your own agent actions, agent assertions, and
locator assertions. Update `DOCS_URL` when testing another site.

The KERNEL browser provider leases one browser per worker by default and
releases it when the run finishes.
