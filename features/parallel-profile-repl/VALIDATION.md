# Validation

## Automated checks

- `npm run typecheck` passes.
- `npm test` passes nine tests covering model routing, concurrency caps of one
  through three, same-site tab exclusion and reuse, partial results while another
  worker awaits a decision, failure isolation, snapshot copying, required evidence
  and bounded retries, and MCP/REPL error handling.
- Kernel MCP discovery confirms `browser_repl`, `manage_browsers`, and
  `manage_profiles` are available.

## Live checks

- A transport smoke test used one write-mode profile and one browser to run three
  concurrent tasks across Hacker News, Techmeme, and daily.dev. All workers paused
  at checkpoints, resumed independently, and completed. The first terminal result
  was available while two tasks were still active.
- Sonnet 5.5 through AI Gateway completed the full eleven-task catalog across five
  sites with a peak concurrency of three. Results arrived incrementally, failed
  extractions were retried, and every final result included its required fields.
- Browser creation through MCP returned `profile_save_changes: true` in the live
  tests. Cleanup deleted the only browser after the work and recording completed.

Run the transport smoke test with:

```bash
npx tsx smoke.ts
```

It creates a temporary profile and one browser, records the run, and deletes both
resources during cleanup.

## Profile persistence caveat

A full-run reload check restored eight demonstration local-storage markers but
missed the three written on Wikipedia. Controlled tests ruled out concurrent
profile sessions and read-only reloads as the cause:

- Simple one-session SDK and MCP runs persisted Wikipedia markers.
- A later read-only session did not remove existing markers.
- Repeating the full Wikipedia navigation pattern in one
  `profile_save_changes: true` browser reproduced the failure: the values were
  visible in-page but absent from the saved profile archive.
- Calling Playwright's `browser.close()` before deleting the session did not make
  the stressed markers persist.

The recipe therefore treats its markers as evidence that tasks shared one live
profile, not as proof that every local-storage write reached the saved archive.
It opens no second verification browser.

## Limits

- Live model tests used Sonnet 5.5 through AI Gateway. Direct Anthropic routing is
  covered by the routing test but was not exercised with a live key.
- Required-field checks validate result shape, not factual accuracy. Review cited
  evidence and the final synthesis.
- Public website structure and content can change after these checks.
