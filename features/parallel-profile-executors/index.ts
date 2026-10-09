import { ToolLoopAgent, hasToolCall, isStepCount, jsonSchema, tool } from "ai";
import Kernel, { ConflictError, NotFoundError } from "@onkernel/sdk";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createResultPublisher, formatBriefing, normalizeSubmission, type Outcome, type Submission } from "./results.js";
import { formatTimeline, runPool } from "./schedule.js";
import { TASKS, type Task } from "./tasks.js";
import { selectModel } from "./model.js";

function integerEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}: expected ${min}..${max}`);
  return value;
}

async function main() {
  const { model, route } = selectModel();
  const requested = process.env.TASK_IDS?.split(",").map(id => id.trim()).filter(Boolean);
  if (requested?.some(id => !TASKS.some(task => task.id === id))) throw new Error("TASK_IDS contains an unknown task");
  const tasks = requested?.length ? TASKS.filter(task => requested.includes(task.id)) : TASKS;
  const maxConcurrentTasks = integerEnv("MAX_CONCURRENT_TASKS", 4, 1, 8);
  const stepsPerTask = integerEnv("STEPS_PER_TASK", 20, 1, 100);
  const profileName = process.env.PROFILE_NAME ?? "parallel-executors-agent-demo";
  const runId = randomUUID();
  const outputDir = new URL(`./artifacts/${runId}/`, import.meta.url);
  const instructions = await readFile(new URL("instructions.md", import.meta.url), "utf8");
  const outcomes: Outcome[] = tasks.map(task => ({
    id: task.id, site: task.site, status: "queued", steps: 0, startedAt: 0, finishedAt: 0,
  }));

  const kernel = new Kernel();
  const abort = new AbortController();
  const interrupt = () => abort.abort(new Error("Run interrupted; cleaning up the browser"));
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  let sessionId: string | undefined;

  await mkdir(outputDir, { recursive: true });
  const publisher = createResultPublisher(
    outputDir,
    () => ({ runId, model: model.modelId, route, maxConcurrentTasks, stepsPerTask,
      complete: outcomes.every(outcome => outcome.status === "succeeded" || outcome.status === "failed"), tasks: outcomes }),
    () => formatBriefing(outcomes),
    event => console.log(JSON.stringify(event)),
  );

  async function deleteExecutor(executor: string) {
    try { await kernel.browsers.playwright.executors.delete(executor, { id_or_name: sessionId! }); }
    catch (error) { if (!(error instanceof NotFoundError)) throw error; }
  }

  // Executors are named per pool lane, so a failed delete can never push the browser past its executor limit.
  const uncleanExecutors = new Set<string>();
  async function runTask(task: Task, lane: number) {
    const executor = `lane-${lane + 1}`;
    const outcome = outcomes.find(candidate => candidate.id === task.id)!;
    outcome.status = "running";
    outcome.startedAt = Date.now();
    await publisher.publish({ type: "task_started", taskId: task.id, executor, at: new Date().toISOString() });
    try {
      abort.signal.throwIfAborted();
      if (uncleanExecutors.has(executor)) {
        try { await deleteExecutor(executor); }
        catch (error) { throw new Error(`Could not reset executor ${executor} left by an earlier task: ${String(error)}`); }
      }
      const agent = new ToolLoopAgent({
        model,
        instructions,
        stopWhen: [isStepCount(stepsPerTask), hasToolCall("submit_result")],
        tools: {
          execute_playwright_code: tool({
            description: "Run Playwright code in this task's only page. Navigate it with page.goto; never open child tabs or popups. Return a compact JSON-serializable value.",
            inputSchema: jsonSchema<{ code: string }>({ type: "object", properties: { code: { type: "string" } }, required: ["code"] }),
            execute: ({ code }) => kernel.browsers.playwright.execute(sessionId!, { code, executor, timeout_sec: 60 }),
          }),
          submit_result: tool({
            description: "Submit the task result once, when finished.",
            inputSchema: jsonSchema<Submission>({ type: "object", required: ["summary", "findings", "limitations"], properties: {
              summary: { type: "string" },
              findings: { type: "array", items: { type: "object", required: ["text", "url"],
                properties: { text: { type: "string" }, url: { type: "string" } } } },
              limitations: { type: "array", items: { type: "string" } },
            } }),
            execute: async () => ({ recorded: true }),
          }),
        },
        onStepFinish: async step => {
          outcome.steps++;
          await publisher.publish({ type: "agent_step", taskId: task.id, step: outcome.steps,
            tools: step.toolCalls.map(call => call.toolName), at: new Date().toISOString() });
        },
      });
      const result = await agent.generate({ abortSignal: abort.signal,
        prompt: `Task ${task.id} on ${task.site}: ${task.purpose}\nStart at ${task.url}\nCurrent time: ${new Date().toISOString()}\nYou have ${stepsPerTask} steps.` });
      const submission = result.steps.flatMap(step => step.toolCalls).find(call => call.toolName === "submit_result");
      if (!submission) throw new Error(result.steps.length >= stepsPerTask
        ? `Used all ${stepsPerTask} steps without submitting` : "Stopped without submitting");
      outcome.status = "succeeded";
      outcome.result = normalizeSubmission(submission.input);
    } catch (error) {
      outcome.status = "failed";
      outcome.error = String(error);
    } finally {
      try {
        await deleteExecutor(executor);
        uncleanExecutors.delete(executor);
      } catch (error) {
        uncleanExecutors.add(executor);
        outcome.cleanupError = `Executor cleanup failed: ${String(error)}`;
      }
      outcome.finishedAt = Date.now();
      if (outcome.status === "succeeded") {
        await publisher.publish({ type: "task_completed", taskId: task.id, cleanupError: outcome.cleanupError, at: new Date().toISOString() });
      } else {
        await publisher.publish({ type: "task_failed", taskId: task.id, error: outcome.error!, cleanupError: outcome.cleanupError, at: new Date().toISOString() });
      }
    }
  }

  try {
    let profile;
    try { profile = await kernel.profiles.create({ name: profileName }); }
    catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      profile = await kernel.profiles.retrieve(profileName);
    }
    const browser = await kernel.browsers.create({ name: `parallel-executors-${runId}`, headless: false, stealth: true,
      timeout_seconds: 300, start_url: "https://duckduckgo.com/", profile: { id: profile.id, save_changes: true } });
    sessionId = browser.session_id;
    await writeFile(new URL("session.json", outputDir), JSON.stringify({ sessionId,
      liveView: browser.browser_live_view_url }, null, 2), { mode: 0o600 });
    console.log(`model: ${model.modelId} (${route}); profile: ${profileName}; ${tasks.length} tasks, ${maxConcurrentTasks} at a time`);
    await runPool(tasks, maxConcurrentTasks, runTask, abort.signal);
    abort.signal.throwIfAborted();
  } finally {
    if (outcomes.some(outcome => outcome.finishedAt)) {
      await writeFile(new URL("results.json", outputDir), JSON.stringify({ runId, model: model.modelId, route,
        maxConcurrentTasks, stepsPerTask, tasks: outcomes }, null, 2));
      console.log("\n" + formatTimeline(outcomes.filter(outcome => outcome.finishedAt)));
      console.log(`\nartifacts: ${outputDir.pathname}`);
    }
    if (sessionId) {
      try { await kernel.browsers.deleteByID(sessionId); }
      catch (error) { if (!(error instanceof NotFoundError)) throw error; }
    }
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
  if (outcomes.some(outcome => outcome.status !== "succeeded")) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
