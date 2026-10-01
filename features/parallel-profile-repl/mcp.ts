import { createMCPClient } from "@ai-sdk/mcp";

export const TOOL_NAMES = ["browser_repl", "manage_browsers", "manage_profiles"] as const;
export const CONTEXT = "The agent is gathering independent evidence for a developer briefing using concurrent browser tasks and one persistent demo profile.";

export async function connectKernel() {
  if (!process.env.KERNEL_API_KEY) throw new Error("Set KERNEL_API_KEY before connecting to Kernel MCP");
  const client = await createMCPClient({ transport: {
    type: "http", url: "https://mcp.onkernel.com/mcp",
    headers: { Authorization: `Bearer ${process.env.KERNEL_API_KEY}` },
  } });
  try {
    const tools = await client.tools();
    for (const name of TOOL_NAMES) {
      if (!tools[name]?.execute) throw new Error(`Kernel MCP did not expose ${name}`);
    }
    // The agent and status poller share one ordered stream of MCP calls.
    let tail: Promise<unknown> = Promise.resolve();
    function call(name: typeof TOOL_NAMES[number], input: Record<string, unknown>) {
      const result = tail.then(() => tools[name].execute!({ ...input, context: CONTEXT }, {
        toolCallId: crypto.randomUUID(), messages: [], context: undefined,
      }));
      tail = result.catch(() => undefined);
      return result;
    }
    return { client, tools, call };
  } catch (error) {
    await client.close();
    throw error;
  }
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

export function replPayload(value: unknown): unknown {
  const response = object(textPayload(value));
  if (!response.success || response.repl_terminated || response.content_truncated) {
    throw new Error(String(response.error ?? "Browser REPL state lost or output truncated"));
  }
  if (!Array.isArray(response.content)) throw new Error("Missing REPL output");
  const output = response.content.map(object).find(item => item.type === "text" && item.channel === "write");
  if (typeof output?.text !== "string") throw new Error("Missing repl.write output");
  return JSON.parse(output.text);
}
