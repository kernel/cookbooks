import { ToolLoopAgent, hasToolCall, isStepCount, jsonSchema, tool } from "ai";
import Kernel, { ConflictError, NotFoundError } from "@onkernel/sdk";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { connectKernel, openTabRunner } from "./mcp.js";
import { formatTimeline, runPool, type Span } from "./schedule.js";
import { TASKS, type Task } from "./tasks.js";
import { selectModel } from "./model.js";

function integerEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}: expected ${min}..${max}`);
  return value;
}

type Submission = { summary: string; findings: Array<{ text: string; url: string }>; limitations: string[] };
type Outcome = Span & { site: string; result?: Submission; error?: string };

async function main() {
  const { model, route } = selectModel();
  const requested = process.env.TASK_IDS?.split(",");
  if (requested?.some(id => !TASKS.some(task => task.id === id))) throw new Error("TASK_IDS contains an unknown task");
  const tasks = requested ? TASKS.filter(task => requested.includes(task.id)) : TASKS;
  const maxActive = integerEnv("MAX_ACTIVE", 3, 1, 6);
  const stepsPerTask = integerEnv("STEPS_PER_TASK", 20, 1, 100);
  const profileName = process.env.PROFILE_NAME ?? "parallel-repl-agent-demo";
  const runId = randomUUID();
  const outputDir = new URL(`./artifacts/${runId}/`, import.meta.url);
  const instructions = await readFile(new URL("instructions.md", import.meta.url), "utf8");

  const kernel = new Kernel();
  const mcp = await connectKernel();
  const abort = new AbortController();
  const interrupt = () => abort.abort(new Error("Run interrupted; cleaning up the browser"));
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  let sessionId: string | undefined;
  const outcomes: Outcome[] = [];

  try {
    await mkdir(outputDir, { recursive: true });
    let profile;
    try { profile = await kernel.profiles.create({ name: profileName }); }
    catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      profile = await kernel.profiles.retrieve(profileName);
    }
    const browser = await kernel.browsers.create({ name: `parallel-repl-${runId}`, headless: false,
      timeout_seconds: 300, profile: { id: profile.id, save_changes: true } });
    sessionId = browser.session_id;
    console.log(`model: ${model.modelId} (${route}); profile: ${profileName}; ${tasks.length} tasks, ${maxActive} at a time, ${stepsPerTask} steps each`);
    console.log(`live view: ${browser.browser_live_view_url}`);
    const tabs = await openTabRunner(mcp, sessionId);

    async function runTask(task: Task) {
      const log = (message: string) => console.log(`[${task.id}] ${message}`);
      const outcome: Outcome = { id: task.id, site: task.site, status: "failed", steps: 0, startedAt: Date.now(), finishedAt: 0 };
      outcomes.push(outcome);
      try {
        abort.signal.throwIfAborted();
        await tabs.open(task.id);
        const agent = new ToolLoopAgent({
          model, instructions,
          stopWhen: [isStepCount(stepsPerTask), hasToolCall("submit_result")],
          tools: {
            browser_repl: tool({
              description: "Run JavaScript against your own tab. Receives page, state, and repl.write; see the instructions.",
              inputSchema: jsonSchema<{ code: string }>({ type: "object", properties: { code: { type: "string" } }, required: ["code"] }),
              execute: ({ code }) => tabs.run(task.id, code, abort.signal),
            }),
            submit_result: tool({
              description: "Submit the task result. Call once, when finished.",
              inputSchema: jsonSchema<Submission>({ type: "object", required: ["summary", "findings", "limitations"], properties: {
                summary: { type: "string" },
                findings: { type: "array", items: { type: "object", required: ["text", "url"],
                  properties: { text: { type: "string" }, url: { type: "string" } } } },
                limitations: { type: "array", items: { type: "string" } },
              } }),
              execute: async () => ({ recorded: true }),
            }),
          },
          onStepFinish: step => {
            const calls = step.toolResults.map(result => result.toolName === "browser_repl" && (result.output as { error?: string }).error
              ? "browser_repl (code error)" : result.toolName);
            log(`step ${++outcome.steps}/${stepsPerTask}: ${calls.join(", ") || "no tool call"}`);
          },
        });
        const result = await agent.generate({ abortSignal: abort.signal,
          prompt: `Task ${task.id} on ${task.site}: ${task.purpose}\nStart at ${task.url}\nYou have ${stepsPerTask} steps.` });
        const submission = result.steps.flatMap(step => step.toolCalls).find(call => call.toolName === "submit_result");
        if (submission) {
          outcome.status = "succeeded";
          outcome.result = submission.input as Submission;
        } else {
          outcome.error = result.steps.length >= stepsPerTask ? `Used all ${stepsPerTask} steps without submitting` : "Stopped without submitting";
        }
      } catch (error) {
        outcome.error = String(error);
      } finally {
        await tabs.close(task.id).catch(() => undefined);
        outcome.finishedAt = Date.now();
        log(outcome.status === "succeeded" ? `done: ${outcome.result!.summary}` : `failed: ${outcome.error}`);
      }
    }

    await runPool(tasks, maxActive, runTask);
    abort.signal.throwIfAborted();
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    try {
      if (sessionId) {
        try { await kernel.browsers.deleteByID(sessionId); }
        catch (error) { if (!(error instanceof NotFoundError)) throw error; }
      }
    } finally { await mcp.client.close(); }
    if (outcomes.length) {
      await writeFile(new URL("results.json", outputDir), JSON.stringify({ runId, model: model.modelId, maxActive, stepsPerTask, tasks: outcomes }, null, 2));
      console.log("\n" + formatTimeline(outcomes.filter(outcome => outcome.finishedAt)));
      console.log(`\nresults: ${new URL("results.json", outputDir).pathname}`);
    }
  }
  if (outcomes.some(outcome => outcome.status !== "succeeded")) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
