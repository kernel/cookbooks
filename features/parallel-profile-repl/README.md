# One profile, parallel browser tasks, a model-written briefing

A [code-mode browser agent](https://www.kernel.sh/docs/browsers/code-mode-webmcp)
using Vercel AI SDK's `ToolLoopAgent`, Anthropic **Claude Sonnet 5.5**
(`claude-sonnet-5-5`), and Kernel's HTTP MCP server. The model sees exactly three
tools: `browser_repl`, `manage_browsers`, and `manage_profiles`.

One model loop coordinates one browser with one write-mode profile. It writes
JavaScript workers in Browser REPL; a small generic scheduler runs arbitrary
mixes of one to three tasks in separate site tabs. There are no hardcoded site
extractors. Results are published independently while other tasks or model
decisions are still in progress.

## Run locally

Requires Node.js 22+, `KERNEL_API_KEY`, and either `ANTHROPIC_API_KEY` or
`AI_GATEWAY_API_KEY` in the environment. The direct route uses `claude-sonnet-5-5`;
AI Gateway uses `anthropic/claude-sonnet-5.5`. Both select Sonnet 5.5.
Use a dedicated demo profile, not a profile containing sensitive accounts.

```bash
npm ci
npm run typecheck
npm test
npm start

# One site
TASK_IDS=top-stories npm start

# Two sites
TASK_IDS=top-stories,playwright-release MAX_ACTIVE=2 npm start

# Three distinct tasks that contribute to one brief
TASK_IDS=top-stories,industry-context,practical-lessons SEED=1500 npm start
```

No deployment is required. The browser is provided by Kernel; the AI SDK loop
runs locally. Missing credentials fail before creating resources. No fallback
model is selected if Sonnet 5.5 is unavailable to the account.

| Setting | Default | Meaning |
| --- | --- | --- |
| `PROFILE_NAME` | `parallel-repl-agent-demo` | Dedicated profile, retained across runs |
| `TASK_IDS` | All eleven tasks | Comma-separated IDs from `tasks.ts` |
| `MAX_ACTIVE` | `3` | Task cap, from 1 to 3 |
| `SEED` | Printed random seed | Repeatable random sequence, not deterministic live timing |
| `MAX_STEPS` | `50` | Model step limit; overall run also has a 20-minute deadline |
| `MODEL_ROUTE` | Direct Anthropic when its key is set; otherwise gateway | Explicitly choose `anthropic` or `gateway`; the selected route must have its key |

## A connected brief, different work on each site

The shared question is: what is happening in AI and developer tooling, what are
builders discussing, what changed in the browser/JavaScript stack, and what
should we read to understand it?

| Site | Distinct task |
| --- | --- |
| Hacker News | Rank relevant discussions; shortlist Show HN projects and Ask HN questions |
| Techmeme | Identify industry news clusters and primary/related reporting sources |
| GitHub | Read Playwright, TypeScript, and Node.js releases for upgrade implications |
| Wikipedia | Explain headless browsers, WebSockets, and Chromium as technical context |
| daily.dev | Open a practical public blog article and extract takeaways, date, and supporting excerpts |

daily.dev uses its public editorial blog, not a personalized feed. Related links
are not independently verified reporting unless the agent actually opens them.
Sources need not concern the same event. The agent must distinguish evidence
from inference and report missing evidence or failures.

## How the agent works

1. The harness creates or reuses a dedicated profile through the Kernel SDK.
   MCP's profile `setup` is interactive, so unattended provisioning happens here.
2. Sonnet inspects that profile through `manage_profiles`, then creates its
   browser through `manage_browsers`. A wrapper pins the profile and forces
   `save_profile_changes: true`. Repeated creates are rejected.
3. The harness starts recording and loads `runtime.js` into Browser REPL. This
   contains scheduling only. Sonnet writes navigation, observation, and extraction
   code using the page supplied to each worker.
4. The scheduler randomly draws a target from 1 to `MAX_ACTIVE` at each dispatch,
   choosing among queued workers whose site tab is free. Running tasks are never
   canceled when a later draw is lower. Same-site work reuses its tab sequentially.
5. A separate poller writes available evidence every second, including while
   Sonnet reasons. Sonnet reads observations, chooses follow-ups, and produces
   `synthesis.md`. The harness stops recording and deletes the browser in `finally`.

The tools retain their Kernel MCP schemas but are deliberately scoped: profile
`get`, browser `create/get`, and REPL for the current browser with reset disabled.
Destructive lifecycle actions belong to the harness. The SDK is used for profile
provisioning, recordings, and cleanup; all agent browsing goes through MCP.

### Iterative decisions without blocking other tasks

The agent can register multiple workers in one short REPL cell:

```javascript
demo.enqueue("practical-lessons", async (page, task, checkpoint) => {
  await page.goto(task.url, { waitUntil: "domcontentloaded" });
  const candidates = await page.getByRole("heading", { level: 2 }).allTextContents();
  const decision = await checkpoint({ candidates: candidates.slice(0, 10) });
  // Continue with the model's decision and return actual cited evidence.
  return { source: page.url(), candidates, decision };
});
repl.write(JSON.stringify(demo.snapshot()));
```

The checkpoint appears in the task snapshot. On a later model step,
`demo.resume("practical-lessons", decision)` resolves it. Other workers continue
while that task waits. Waiting tasks keep their concurrency slot and tab.
The example illustrates the protocol, not a completed article-reading worker.

REPL calls are serialized, but the asynchronous workers overlap. One model loop
does not mean three simultaneous model conversations. The cap applies to task
lifetimes, including decision waits; event timestamps show overlap, not continuous
network activity. Each selected site's tab stays open, so the full run can have
five site tabs plus the initial page, with at most three active tasks.

## Results at any time

See [an example completed briefing](EXAMPLE.md) from a three-task run.

The printed `artifacts/<run-id>/` directory contains:

- `updates.jsonl`: one terminal evidence update per task attempt, also printed to stdout.
  Use `(id, attempt)` to identify updates and the highest attempt as the current version.
- `snapshot.json`: all pending, queued, running, succeeded, or failed tasks,
  checkpoint observations, available evidence, concurrency events, and completion.
- `briefing.md`: a readable partial evidence report, atomically replaced with the snapshot.
- `agent.jsonl`: model step text and tool names, without full management responses.
- `synthesis.md`: the model's final interpretation, separate from collected evidence.
- `results.json`: final evidence, event history, seed, and token usage.
- `session.json` and `replay.mp4`: private session links and the recorded run.

Each task declares required evidence fields. Empty required fields fail the
attempt; the model can use `demo.retry(id, worker)` to repair it, up to three
attempts per task. Earlier results remain in the task's history. This checks
presence, not truth: review the cited evidence and the model's interpretation.

```bash
tail -f artifacts/<run-id>/updates.jsonl
cat artifacts/<run-id>/briefing.md
```

Inside REPL, `demo.snapshot(["top-stories", "industry-context"])` returns just
those tasks without waiting. The task catalog is selected before the run; this
recipe does not expose a conversational submission API or HTTP server.

## Persistence, safety, and limits

- The run creates exactly one browser for the dedicated profile. MCP must confirm
  `profile_save_changes: true`; otherwise the run stops. That browser holds the
  profile's write lease until the `finally` cleanup deletes it and commits the
  profile. The recipe never opens a second verification browser.
- Each successful task writes its run ID to `parallel-repl-demo:<task-id>` in
  local storage on its final origin. These markers show that the concurrent tabs
  shared one live profile; they are not an archive-persistence guarantee.
- Only use trusted model-generated code. REPL has broad execution capabilities;
  scoping the management tools and prompting read-only behavior is not a sandbox.
  Website content is untrusted and must not become agent instructions.
- Use explicit page handles. Global foreground-tab controls can make parallel
  tasks act on the wrong page. Tabs share same-origin cookies/storage; stateful
  actions need additional coordination.
- Worker failures are recorded independently. An unfinished/failed run exits
  nonzero. REPL loss terminates the run rather than silently replaying actions.
  MCP cells are capped at 30 seconds; long work belongs in background workers.
- Normal errors trigger cleanup. Force-killing the process may bypass it; the
  five-minute idle timeout is only a fallback. The dedicated profile is retained.
- Artifacts are gitignored and can contain source content and signed access links.
  Keep them private. Recordings show the foreground tab; use events for concurrency.

See [validation](VALIDATION.md) for exactly what has been tested, including the
separate historical scripted baseline. Browser transport tests are not proof of
Sonnet task quality or end-to-end model completion.

Current live-test status: Sonnet 5.5 through AI Gateway completed the full task
catalog, including recovery from failed extractions. A historical reload check
restored eight markers but missed all three Wikipedia markers. Investigation
reproduced that loss with one write-mode browser: the values were visible to the
renderer but absent from the saved profile archive after repeated Wikipedia
navigations. It was not caused by overlapping profile sessions.
