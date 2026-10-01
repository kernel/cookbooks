import { ToolLoopAgent, isStepCount, type ToolSet } from "ai";
import Kernel, { ConflictError, NotFoundError } from "@onkernel/sdk";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { connectKernel, object, replPayload, textPayload, TOOL_NAMES } from "./mcp.js";
import { TASKS as catalog, type Task } from "./tasks.js";
import { selectModel } from "./model.js";

function integerEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}: expected ${min}..${max}`);
  return value;
}

type Attempt = {
  attempt: number;
  status: "pending" | "queued" | "running" | "succeeded" | "failed";
  result?: unknown; error?: string; sourceUrl?: string; startedAt?: number; finishedAt?: number;
};
type TaskState = Task & Attempt & { history?: Attempt[] };
type Snapshot = { tasks: TaskState[]; active: number; peakActive: number; complete: boolean; events: unknown[] };

async function main() {
  const { model, route } = selectModel();
  const requested = process.env.TASK_IDS?.split(",");
  const tasks = requested ? catalog.filter(task => requested.includes(task.id)) : catalog;
  if (!tasks.length || requested?.some(id => !catalog.some(task => task.id === id))) throw new Error("TASK_IDS contains an unknown task");
  const maxActive = integerEnv("MAX_ACTIVE", 3, 1, 3);
  const seed = integerEnv("SEED", Date.now() >>> 0, 0, 4294967295);
  const maxSteps = integerEnv("MAX_STEPS", 50, 1, 200);
  const runId = randomUUID();
  const browserName = `parallel-repl-${runId}`;
  const outputDir = new URL(`./artifacts/${runId}/`, import.meta.url);
  const profileName = process.env.PROFILE_NAME ?? "parallel-repl-agent-demo";
  const kernel = new Kernel({ maxRetries: 0 });
  const mcp = await connectKernel();
  let sessionId: string | undefined;
  let replayId: string | undefined;
  let browserCreateAttempted = false;
  let initialized = false;
  let polling = true;
  let monitor: Promise<void> | undefined;
  const abort = new AbortController();
  const interrupt = () => abort.abort(new Error("Run interrupted; cleaning up the browser"));
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  const deadline = setTimeout(() => abort.abort(new Error("Agent exceeded its 20-minute limit")), 20 * 60_000);
  const delivered = new Set<string>();
  let snapshot: Snapshot = { tasks: tasks.map(task => ({ ...task, status: "pending", attempt: 0 })), active: 0, peakActive: 0, complete: false, events: [] };

  async function publish() {
    const report = { runId, seed, updatedAt: new Date().toISOString(), ...snapshot };
    for (const task of snapshot.tasks) {
      const { history = [], ...current } = task;
      for (const attempt of [...history, current]) {
        const key = `${task.id}:${attempt.attempt}`;
        if (["succeeded", "failed"].includes(attempt.status) && !delivered.has(key)) {
          const update = { type: "task-result", observedAt: report.updatedAt, id: task.id, site: task.site, ...attempt };
          await appendFile(new URL("updates.jsonl", outputDir), JSON.stringify(update) + "\n");
          console.log(JSON.stringify(update));
          delivered.add(key);
        }
      }
    }
    const brief = ["# Developer briefing — evidence so far", "", snapshot.complete ? "All tasks finished; see synthesis.md for the agent's interpretation." : "Partial results. Other tasks are pending or running.", "",
      ...snapshot.tasks.flatMap(task => [`## ${task.id} (${task.status})`, "", task.purpose, "",
        task.error ?? (task.result === undefined ? "No result yet." : "```json\n" + JSON.stringify(task.result, null, 2) + "\n```"), ""]),
    ].join("\n");
    for (const [name, body] of [["snapshot.json", JSON.stringify(report, null, 2)], ["briefing.md", brief]]) {
      await writeFile(new URL(name + ".tmp", outputDir), body);
      await rename(new URL(name + ".tmp", outputDir), new URL(name, outputDir));
    }
  }

  async function repl(code: string) {
    return replPayload(await mcp.call("browser_repl", { session_id: sessionId, code, timeout_sec: 30 }));
  }
  async function poll() {
    snapshot = await repl("repl.write(JSON.stringify(demo.snapshot()));") as Snapshot;
    await publish();
  }

  try {
    await mkdir(outputDir, { recursive: true, mode: 0o700 });
    console.log(`model: ${model.modelId}; route: ${route}; seed: ${seed}; artifacts: ${outputDir.pathname}`);
    await publish();
    let profile;
    try { profile = await kernel.profiles.create({ name: profileName }); }
    catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      profile = await kernel.profiles.retrieve(profileName);
    }
    const profileId = profile.id;
    const runtime = await readFile(new URL("runtime.js", import.meta.url), "utf8");
    const tools: ToolSet = {
      manage_profiles: { ...mcp.tools.manage_profiles, execute: async input => {
        if (object(input).action !== "get") throw new Error("Use get; the harness owns the dedicated profile's lifecycle.");
        return mcp.call("manage_profiles", { action: "get", profile_id: profileId });
      } },
      manage_browsers: { ...mcp.tools.manage_browsers, execute: async input => {
        const action = object(input).action;
        if (action === "get" && sessionId) return mcp.call("manage_browsers", { action: "get", session_id: sessionId });
        if (action !== "create" || browserCreateAttempted) throw new Error("Create exactly one browser; use get afterwards. The harness handles deletion.");
        browserCreateAttempted = true;
        const response = await mcp.call("manage_browsers", { action: "create", name: browserName,
          profile_id: profileId, save_profile_changes: true, headless: false,
          start_url: "https://example.com", timeout_seconds: 300 });
        const session = object(object(textPayload(response)).browser);
        if (typeof session.session_id !== "string") throw new Error("Browser creation returned no session ID");
        if (session.profile_save_changes !== true) throw new Error("Browser was not created with profile_save_changes=true");
        sessionId = session.session_id;
        const recording = await kernel.browsers.replays.start(sessionId);
        replayId = recording.replay_id;
        await writeFile(new URL("session.json", outputDir), JSON.stringify({ sessionId, profileId,
          liveView: session.browser_live_view_url, replay: recording.replay_view_url }, null, 2), { mode: 0o600 });
        console.log(`browser: ${sessionId}; recording started (private links in session.json)`);
        await repl(`var playwright = await import("patchright");
          var pwBrowser = await playwright.chromium.connectOverCDP(process.env.CDP_ENDPOINT);
          var pwContext = pwBrowser.contexts()[0];
          ${runtime}
          var demo = createTaskRunner(${JSON.stringify({ tasks, maxActive, seed, runId })}, pwContext);
          repl.write(JSON.stringify({ ready: true }));`);
        initialized = true;
        monitor = (async () => {
          while (polling) { await poll(); await sleep(1000); }
        })().catch(error => { abort.abort(error); throw error; });
        void monitor.catch(() => undefined);
        return { content: [{ type: "text", text: JSON.stringify({ session_id: sessionId, profile_id: profileId, ready: true }) }] };
      } },
      browser_repl: { ...mcp.tools.browser_repl, execute: async input => {
        const args = object(input);
        if (!initialized || !sessionId) throw new Error("Create the browser before using Browser REPL");
        if (args.reset) throw new Error("Reset would discard all concurrent work; it is disabled for this cookbook.");
        return mcp.call("browser_repl", { session_id: sessionId, code: args.code, timeout_sec: 30 });
      } },
    };
    const instructions = await readFile(new URL("instructions.md", import.meta.url), "utf8");
    const agent = new ToolLoopAgent({
      model, tools, activeTools: [...TOOL_NAMES],
      maxRetries: 0, stopWhen: isStepCount(maxSteps), instructions,
      onStepFinish: async step => {
        const update = { type: "agent-step", at: new Date().toISOString(), text: step.text,
          tools: step.toolCalls.map(call => call.toolName) };
        await appendFile(new URL("agent.jsonl", outputDir), JSON.stringify(update) + "\n");
        console.log(JSON.stringify(update));
      },
    });
    const result = await agent.generate({ prompt: `Complete these independent tasks, using their purposes as instructions. The concurrency cap is ${maxActive}.\n${JSON.stringify(tasks, null, 2)}`, abortSignal: abort.signal });
    polling = false;
    await monitor;
    if (!initialized) throw new Error("Agent ended without creating its browser");
    await poll();
    await writeFile(new URL("synthesis.md", outputDir), result.text);
    await writeFile(new URL("results.json", outputDir), JSON.stringify({ model: model.modelId, route, seed, usage: result.totalUsage, ...snapshot }, null, 2));
    if (!snapshot.complete || snapshot.tasks.some(task => task.status === "failed")) throw new Error("Some tasks failed or remain unfinished; inspect snapshot.json and synthesis.md");
    if (snapshot.peakActive > maxActive) throw new Error("Task concurrency exceeded its cap");
    console.log(result.text);
  } finally {
    clearTimeout(deadline);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    polling = false;
    try { await monitor; }
    finally {
      try {
        if (sessionId && replayId) {
          await kernel.browsers.replays.stop(replayId, { id_or_name: sessionId });
          const recording = await kernel.browsers.replays.download(replayId, { id_or_name: sessionId });
          await writeFile(new URL("replay.mp4", outputDir), Buffer.from(await recording.arrayBuffer()));
        }
      } finally {
        try {
          // The unique name also covers a create call with an ambiguous response.
          if (browserCreateAttempted) {
            try { await kernel.browsers.deleteByID(sessionId ?? browserName); }
            catch (error) { if (!(error instanceof NotFoundError)) throw error; }
          }
        } finally { await mcp.client.close(); }
      }
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
