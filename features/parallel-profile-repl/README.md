# Parallel agent tasks in tabs of one browser

Several AI agents work at the same time, each in its own tab of **one** Kernel
browser that loads **one** profile. Each task gets its own agent loop (Vercel AI
SDK `ToolLoopAgent` with Anthropic **Claude Sonnet 5.5**) and a fixed budget of
steps. The agents drive their tabs by writing Playwright code that runs in
Kernel's [Browser REPL](https://www.kernel.sh/docs/browsers/code-mode-webmcp)
through the Kernel MCP server.

## When to use this

Use this pattern when several tasks need the same profile at the same time and
that profile has to stay in write mode, so changes made during the run (cookies,
storage, sign-in state) are saved back to it. Only one browser can save changes to
a profile at a time, so the tasks share that browser and each works in its own tab.

```
top-stories          |███████                                           | succeeded in 10s, 2 steps
new-projects         |███████████                                       | succeeded in 16s, 3 steps
community-questions  |█████████████                                     | succeeded in 19s, 3 steps
playwright-release   |       █████████                                  | succeeded in 12s, 2 steps
typescript-release   |           ███████████████████                    | succeeded in 28s, 6 steps
...
                      0s                                             72s
Peak tabs open at once: 3
```

## Run locally

Requires Node.js 22+, `KERNEL_API_KEY`, and either `ANTHROPIC_API_KEY` or
`AI_GATEWAY_API_KEY`. Use a dedicated demo profile, not one with sensitive accounts.

```bash
npm ci
npm test         # unit tests, no network
npm run smoke    # live tab check against Kernel, no model
npm start        # all eleven tasks, three at a time

TASK_IDS=top-stories,new-projects,browser-background npm start
MAX_ACTIVE=5 STEPS_PER_TASK=10 npm start
```

| Setting | Default | Meaning |
| --- | --- | --- |
| `TASK_IDS` | All eleven tasks | Comma-separated IDs from `tasks.ts` |
| `MAX_ACTIVE` | `3` | Tasks (and tabs) running at once, 1 to 6 |
| `STEPS_PER_TASK` | `20` | Model steps each task may use, including failed attempts |
| `PROFILE_NAME` | `parallel-repl-agent-demo` | Profile loaded by the browser, created if missing and kept across runs |
| `MODEL_ROUTE` | Anthropic if its key is set, otherwise AI Gateway | `anthropic` or `gateway` |

## How it works

1. The harness creates or reuses the profile, then creates one browser with
   `profile: { id, save_changes: true }`. Every tab shares that profile's cookies
   and storage, and changes are saved back to it when the browser is deleted.
2. It loads `runtime.js` into Browser REPL. The runtime keeps a map of task tabs.
3. A pool starts up to `MAX_ACTIVE` tasks. Each task opens its own tab and runs
   its own agent loop, which stops after it calls `submit_result` or runs out of
   steps. When a task finishes, its tab closes and the next task starts.
4. The agent's only browser tool is `browser_repl`. Its code runs inside
   `async (page, state, repl) => { ... }`, where `page` is that task's tab and
   `state` persists across the task's calls. A selector that misses or a timeout
   comes back to the model as an error to fix on its next step.
5. When all tasks are done, the harness deletes the browser, prints the timeline,
   and writes `artifacts/<run-id>/results.json` with each task's summary, cited
   findings, limitations, steps used, and timing.

A task that runs out of steps or hits an API error is marked failed, and the
other tasks keep going. The run exits nonzero if any task failed.

### Why the code runs as background jobs

Browser REPL runs one cell at a time per browser. If an agent's cell navigated
and waited inside the cell, the other tabs would have to take turns. Instead, the
harness wraps the agent's code in a cell that only starts a background job on
that task's tab and returns at once. The harness then polls the job until it
finishes and returns the output as the tool result. Cells stay short, so jobs on
different tabs overlap. Because the code runs inside a function, one agent's
variables cannot collide with another's.

## Limits

- Use `page`, not Browser REPL's native helpers such as `gotoUrl` or
  `switchTab`. Those act on whichever tab is in the foreground, which may belong
  to another task.
- Tabs share one profile, so they share same-origin cookies and storage. These
  tasks only read pages; tasks that sign in or change state on the same site need
  their own coordination.
- The live view shows only the foreground tab. Use the timeline to see overlap.
- Browser REPL is unrestricted code execution in the browser VM, not a sandbox.
  Page content is untrusted, and the instructions keep browsing read-only.
- Normal exits and Ctrl-C delete the browser. A force-kill leaves it until its
  five-minute idle timeout.
