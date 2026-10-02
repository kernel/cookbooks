import { createMCPClient } from "@ai-sdk/mcp";
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const CONTEXT = "The agent is running independent browser tasks in separate tabs of one browser that uses one profile.";

export async function connectKernel() {
  if (!process.env.KERNEL_API_KEY) throw new Error("Set KERNEL_API_KEY before connecting to Kernel MCP");
  const client = await createMCPClient({ transport: {
    type: "http", url: "https://mcp.onkernel.com/mcp",
    headers: { Authorization: `Bearer ${process.env.KERNEL_API_KEY}` },
  } });
  try {
    const tools = await client.tools();
    const repl = tools.browser_repl;
    if (!repl?.execute) throw new Error("Kernel MCP did not expose browser_repl");
    const callRepl = (sessionId: string, code: string) => repl.execute!({ session_id: sessionId, code, timeout_sec: 30, context: CONTEXT },
      { toolCallId: crypto.randomUUID(), messages: [], context: undefined });
    return { client, callRepl };
  } catch (error) {
    await client.close();
    throw error;
  }
}

export type CodeResult = { output: string; error?: string };

// One Browser REPL holds every tab. Model code becomes a short-lived cell that starts a
// background job, so other tasks' cells are not blocked while this one navigates.
export async function openTabRunner(kernel: Awaited<ReturnType<typeof connectKernel>>, sessionId: string) {
  const exec = async (code: string) => replPayload(await kernel.callRepl(sessionId, code));
  const runtime = await readFile(new URL("runtime.js", import.meta.url), "utf8");
  await exec(`var playwright = await import("patchright");
    var pwBrowser = await playwright.chromium.connectOverCDP(process.env.CDP_ENDPOINT);
    ${runtime}
    var runner = createTabRunner(pwBrowser.contexts()[0]);
    repl.write(JSON.stringify({ ready: true }));`);
  const id = (taskId: string) => JSON.stringify(taskId);
  return {
    open: (taskId: string) => exec(`repl.write(JSON.stringify(await runner.open(${id(taskId)})));`),
    close: (taskId: string) => exec(`repl.write(JSON.stringify(await runner.close(${id(taskId)})));`),
    async run(taskId: string, code: string, signal?: AbortSignal): Promise<CodeResult> {
      const response = textPayload(await kernel.callRepl(sessionId,
        `repl.write(JSON.stringify(runner.start(${id(taskId)}, async (page, state, repl) => {\n${code}\n})));`));
      const started = object(response);
      if (started.repl_terminated) throw new Error("Browser REPL terminated; tab state is gone");
      if (!started.success) return { output: "", error: String(started.error ?? "Code did not start") };
      const jobId = JSON.parse(writeOutput(started));
      while (true) {
        signal?.throwIfAborted();
        const job = object(await exec(`repl.write(JSON.stringify(runner.poll(${jobId})));`));
        if (job.done) return { output: String(job.output), ...(job.error ? { error: String(job.error) } : {}) };
        await sleep(500, undefined, { signal });
      }
    },
  };
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}

export function textPayload(value: unknown): unknown {
  const response = object(value);
  if (response.isError) throw new Error("Kernel MCP operation failed: " + JSON.stringify(response.content));
  if (!Array.isArray(response.content)) throw new Error("Missing MCP content");
  const text = response.content.map(object).filter(item => item.type === "text").map(item => item.text).join("");
  return JSON.parse(text);
}

function writeOutput(response: Record<string, unknown>) {
  if (!Array.isArray(response.content)) throw new Error("Missing REPL output");
  const output = response.content.map(object).find(item => item.type === "text" && item.channel === "write");
  if (typeof output?.text !== "string") throw new Error("Missing repl.write output");
  return output.text;
}

export function replPayload(value: unknown): unknown {
  const response = object(textPayload(value));
  if (!response.success || response.repl_terminated || response.content_truncated) {
    throw new Error(String(response.error ?? "Browser REPL state lost or output truncated"));
  }
  return JSON.parse(writeOutput(response));
}
