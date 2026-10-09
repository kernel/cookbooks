# Parallel agents in one profiled browser

Run several independent AI research tasks at once in **one** Kernel browser
that loads **one** write-mode profile. Each task gets its own AI SDK
`ToolLoopAgent` and a named Kernel Playwright executor. An executor owns one tab,
so calls for different tasks can run concurrently.

The example creates a connected tech and developer-news briefing from seven sites:

| Site | Task contribution |
| --- | --- |
| Hacker News | Discussions, new projects, and community questions |
| GitHub | Playwright, TypeScript, and Node.js release changes |
| Kernel | Recent platform changelog entries |
| Simon Willison's Weblog | LLM and agent posts from the last 24 hours |
| Ars Technica | AI policy changes and security incidents |
| Techmeme | Industry stories and related reporting |
| Chrome for Developers | Practical browser-engineering articles and excerpts |

## When to use this

Use this pattern when several tasks need the same profile at the same time and
that profile has to stay in write mode, so changes made during the run (cookies,
storage, sign-in state) are saved back to it. Several browsers can save to the
same profile, but their saves race and can overwrite each other's changes. Using
one browser avoids that: the tasks share its cookies and storage, each works in
its own tab, and the browser saves to the profile once when it is deleted.

If the tasks only read profile state, start one browser per task with
`profile: { id, save_changes: false }` instead. Those browsers are isolated from
each other, and the number of concurrent tasks isn't limited to what one headful
browser can handle.

The example tasks browse public sites and don't depend on authenticated profile
state; they show the mechanics so you can swap in tasks that do.

## Run locally

Requires Node.js 22+, `KERNEL_API_KEY`, and either `ANTHROPIC_API_KEY` or
`AI_GATEWAY_API_KEY`. Use a dedicated profile rather than one containing
sensitive accounts.

```bash
npm ci
npm test
npm run smoke
npm start

TASK_IDS=top-stories,kernel-changelog,llm-notes npm start
MAX_CONCURRENT_TASKS=5 STEPS_PER_TASK=10 npm start
```

| Setting | Default | Meaning |
| --- | --- | --- |
| `TASK_IDS` | All twelve tasks | Comma-separated IDs from `tasks.ts` |
| `MAX_CONCURRENT_TASKS` | `4` | Maximum tasks and named executors active at once, 1 to 8 |
| `STEPS_PER_TASK` | `20` | Model steps available to each task |
| `PROFILE_NAME` | `parallel-executors-agent-demo` | Profile to create or reuse across runs |
| `MODEL_ROUTE` | Anthropic when available, otherwise AI Gateway | `anthropic` or `gateway` |

Both routes use Claude Sonnet 5.5; `MODEL_ROUTE` only chooses whether requests go
directly to Anthropic or through AI Gateway. To use a different model, edit
`model.ts`.

Kernel supports up to eight named executors in one browser. Start with four or
five concurrent tasks for real workloads; page memory, CPU, model rate limits,
and the sites being visited usually become constraints before the executor
limit. Tune `MAX_CONCURRENT_TASKS` for the workload rather than hard-coding the
task catalog around one concurrency level.

## How it works

1. The harness creates or reuses one profile and starts one stealth browser
   (`stealth: true`) with `profile: { id, save_changes: true }`.
2. Browser creation passes `start_url: "https://duckduckgo.com/"`. Kernel
   replaces pages restored from the profile with that single page before the
   session is ready.
3. A deterministic pool starts at most `MAX_CONCURRENT_TASKS` task agents.
4. Each task uses its pool slot's executor name (`lane-1`, `lane-2`, ...). Every
   `execute_playwright_code` call for that task carries the same executor, so its
   `page` stays bound to the same tab. Calls on different executors overlap.
5. Agents keep all work in that page. They read link URLs and use `page.goto()`
   instead of clicking links that may open child tabs or popups.
6. When a task finishes, the harness deletes its executor and closes its tab.
   Only after cleanup completes does the scheduler reuse that slot.
7. Every lifecycle event updates `updates.jsonl`, `snapshot.json`, and
   `briefing.md`. A caller can read completed results while other tasks are still
   browsing.
8. After all tasks finish, the harness writes the final `results.json` and timing
   chart, then deletes the browser once.

Each Playwright call is independent. The model receives `page` but cannot rely
on local JavaScript variables surviving its next call. Browser state and the
executor-owned tab do persist, which is enough to navigate, inspect, and follow
links over multiple model steps.

## Output

Each run writes to `artifacts/<run-id>/`:

- `updates.jsonl`: append-only task and agent-step events;
- `snapshot.json`: current state for every queued, running, and finished task;
- `briefing.md`: findings from tasks that have already completed;
- `results.json`: final structured outcomes and timing;
- `session.json`: private live-view metadata.

One task failing does not stop the other task agents. The process exits nonzero
if any task fails. If deleting a task's executor fails, the error is recorded in
that task's `cleanupError` and its result is kept. The next task in that slot
retries the delete before it starts and fails if the executor still cannot be
removed. Because slots reuse executor names, a failed delete never pushes the
browser past its eight-executor limit.

## Limits

- All tabs share the profile's cookies and storage. This read-only example does
  not coordinate multiple tasks writing to the same origin.
- The one-page-per-task rule is part of the agent instructions, not a browser
  policy. Custom task instructions should preserve it if tab count matters.
- Reusing a write-mode profile may restore tabs from an earlier session. The
  browser's `start_url` replaces them before any task begins, leaving one
  DuckDuckGo page alongside the executor-owned task pages.
- Executor tabs open in the background, so the live view mostly shows the
  DuckDuckGo start page rather than the agents' work. Use `updates.jsonl` and the
  final timeline to follow task progress and overlap.
- Public page structure changes. The agents inspect the current page rather than
  relying on hard-coded extraction selectors, but evidence should still be
  reviewed.
- Normal exits and interrupts delete the browser. A force-kill leaves it until
  its five-minute idle timeout.
