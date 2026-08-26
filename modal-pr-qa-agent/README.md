# PR QA with Claude computer use + a Kernel browser

Does the feature still work in a real browser? This agent points Claude computer use at a PR preview through a Kernel headful browser, records the session with Replays, and returns pass/fail. [kernel_pr_qa_agent.py](kernel_pr_qa_agent.py) is a literate example; the full walkthrough, including the deploy path that comments verdicts back on PRs, is in the file.

## Setup

```sh
modal secret create kernel KERNEL_API_KEY=...
modal secret create anthropic-secret ANTHROPIC_API_KEY=...
```

## Run

```sh
modal run kernel_pr_qa_agent.py
```
