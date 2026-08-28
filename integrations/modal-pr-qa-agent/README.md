# PR QA with Claude computer use + a Kernel browser

Does the feature still work in a real browser? This agent points Claude computer use at a PR preview through a Kernel headful browser, records the session with Replays, and returns pass/fail. [kernel_pr_qa_agent.py](kernel_pr_qa_agent.py) is a literate example; the full walkthrough, including the deploy path that comments verdicts back on PRs, is in the file.

## Prerequisites

- Python 3.10+ and the Modal CLI: `pip install modal && modal setup`
- A [Kernel](https://www.kernel.sh) account and API key
- An [Anthropic](https://console.anthropic.com) API key
- A [Modal](https://modal.com) account

The agent runs remotely on Python 3.11 (defined in the Modal image), so your local version only needs to run the CLI.

## Setup

```sh
modal secret create kernel KERNEL_API_KEY=...
modal secret create anthropic-secret ANTHROPIC_API_KEY=...
```

## Run

```sh
modal run kernel_pr_qa_agent.py
```

## What a successful run looks like

The demo QAs a working and a deliberately broken variant of a feedback form:

```
Verifying the working variant: https://...--demo-app.modal.run/working
recording: https://<replay-view-url>   <- open this to watch the agent drive
  turn 1/22: screenshot
  turn 2/22: left_click, type, left_click, type, left_click, wait, screenshot
  turn 3/22: submit_verdict(pass)
  -> pass: form submitted and confirmation appeared
  recording saved to Modal Volume: /traces/working.mp4

working -> pass   broken -> fail
(expected: working -> pass, broken -> fail)
```

Fetch a recording with `modal volume get kernel-pr-qa-traces working.mp4`.

## Point it at your own PRs

- One-off against a real preview: call `verify_pr.remote(<preview-url>, <change description>)` instead of the demo loop in `main`. The change description plays the role of `DEMO_CHANGE`: one or two sentences describing what should work.
- Every PR automatically: uncomment the webhook block at the bottom of the file, create the `github-webhook` and `github-token` secrets it documents, `modal deploy`, and register the printed URL as a repo webhook. The bot comments the verdict back on the PR.
- Knobs: `MODEL` (swap Sonnet for Opus on harder UIs, one line) and `MAX_ITERS` (bounds cost per run)

## Troubleshooting

- Verdict `inconclusive`: the agent hit the iteration cap or never called `submit_verdict`; raise `MAX_ITERS` or make the change description more concrete
- `recording not ready to download; skipping trace save`: the replay was still processing when the run ended; the verdict is unaffected, and the replay is still viewable from the Kernel dashboard
- Anthropic auth or model errors: confirm your key has access to the model pinned in `MODEL`
- `Secret 'kernel' not found` (or `anthropic-secret`): create the secrets with the exact names in Setup
- `demo app never became reachable`: the Modal web container was still booting; rerun
