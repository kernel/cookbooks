# e2e + KERNEL

Run agentic end-to-end tests against any publicly reachable documentation site
in a hosted browser with [e2e](https://e2e.tester.army/docs) and KERNEL.

The included example targets the [KERNEL browser session API
reference][browser-session-docs]. Replace the URL, paths, and assertions in the
test file to use another documentation site.

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
`https://www.kernel.sh` and can be changed to another publicly reachable docs
site. The browser runs headless by default, so the test does not open a second
desktop window.

## Extend the test

Edit `tests/smoke.e2e.ts` to change the docs paths and add your own agent
actions, agent assertions, structured extraction, and locator assertions. Update
`DOCS_URL` when testing another site.

The KERNEL browser provider leases one browser per worker by default and
releases it when the run finishes.
