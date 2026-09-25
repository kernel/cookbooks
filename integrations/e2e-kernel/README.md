# e2e + KERNEL

Run an agentic end-to-end test in a hosted KERNEL browser with
[e2e](https://e2e.tester.army/docs).

The example opens [MagniTasks](https://www.magnitasks.com), asks an agent to
navigate to the Projects page, and verifies the resulting heading with a
locator assertion.

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

Set `KERNEL_API_KEY` and `OPENAI_API_KEY` in `.env`. `APP_URL` defaults to
`https://www.magnitasks.com` and can be changed to another publicly reachable
web application.

## Extend the test

Edit `tests/smoke.e2e.ts` to add your own agent actions, agent assertions, and
locator assertions. Update `APP_URL` when testing another application.

The KERNEL browser provider leases one browser per worker by default and
releases it when the run finishes.
