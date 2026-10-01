import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import { replPayload, textPayload } from "./mcp.js";
import { selectModel } from "./model.js";

test("model routing keeps Sonnet 5.5 fixed and honors explicit route selection", () => {
  assert.equal(selectModel({ ANTHROPIC_API_KEY: "test" }).model.modelId, "claude-sonnet-5-5");
  assert.equal(selectModel({ AI_GATEWAY_API_KEY: "test" }).model.modelId, "anthropic/claude-sonnet-5.5");
  assert.equal(selectModel({ ANTHROPIC_API_KEY: "test", AI_GATEWAY_API_KEY: "test" }).route, "anthropic");
  assert.equal(selectModel({ ANTHROPIC_API_KEY: "test", AI_GATEWAY_API_KEY: "test", MODEL_ROUTE: "gateway" }).route, "gateway");
  assert.throws(() => selectModel({}), /Set ANTHROPIC_API_KEY/);
  assert.throws(() => selectModel({ AI_GATEWAY_API_KEY: "test", MODEL_ROUTE: "anthropic" }), /No model fallback/);
  assert.throws(() => selectModel({ ANTHROPIC_API_KEY: "test", MODEL_ROUTE: "unknown" }), /MODEL_ROUTE/);
});

const source = await readFile(new URL("runtime.js", import.meta.url), "utf8");
type State = { tasks: Array<{ id: string; status: string; result?: unknown; awaitingDecision?: boolean; attempt: number; history: Array<{ status: string }> }>; active: number; peakActive: number; complete: boolean; events: Array<{ event: string; target?: number; active: number }> };
type Worker = (page: object, task: { id: string }, checkpoint: (value: unknown) => Promise<unknown>) => Promise<unknown>;
type Runner = { enqueue(id: string, worker: Worker): void; retry(id: string, worker: Worker): void; resume(id: string, value: unknown): void; snapshot(ids?: string[]): State };

function runner(sites: string[], cap = 3, seed = 1234567, requiredFields: string[] = []) {
  const pages: object[] = [];
  const create: (config: object, context: object) => Runner = runInNewContext(source + "\ncreateTaskRunner", { queueMicrotask });
  const demo = create({ maxActive: cap, seed, runId: "unit-test", tasks: sites.map((site, i) => ({ id: String(i), site, requiredFields })) }, {
    async newPage() {
      const page = { setDefaultTimeout() {}, setDefaultNavigationTimeout() {}, url: () => "https://example.com", async evaluate() {} };
      pages.push(page);
      return page;
    },
  });
  return { demo, pages };
}

async function finished(demo: Runner) {
  for (let i = 0; i < 200; i++) {
    if (demo.snapshot().complete) return demo.snapshot();
    await sleep(5);
  }
  throw new Error("Scheduler did not finish");
}

for (const cap of [1, 2, 3]) {
  test(`cap ${cap}: mixed sites finish, same-site tasks reuse pages without overlap`, async () => {
    const sites = ["hn", "daily", "hn", "techmeme", "daily", "github", "wiki", "hn"];
    const { demo, pages } = runner(sites, cap);
    const inUse = new Set<object>();
    let observedPeak = 0;
    sites.forEach((_, i) => demo.enqueue(String(i), async page => {
      assert.ok(!inUse.has(page));
      inUse.add(page);
      observedPeak = Math.max(observedPeak, inUse.size);
      await sleep(10);
      inUse.delete(page);
      return { evidence: i };
    }));
    const result = await finished(demo);
    assert.ok(result.tasks.every(task => task.status === "succeeded"));
    assert.equal(pages.length, new Set(sites).size);
    assert.equal(result.peakActive, observedPeak);
    assert.ok(observedPeak <= cap);
    assert.ok(result.events.every(event => event.active <= cap));
    if (cap === 3) assert.equal(observedPeak, 3);
  });
}

test("partial evidence arrives while another worker awaits a model decision", async () => {
  const { demo } = runner(["hn", "daily"], 3, 1234567);
  demo.enqueue("0", async (_page, _task, checkpoint) => checkpoint({ question: "which article?" }));
  demo.enqueue("1", async () => ({ headline: "finished independently" }));
  for (let i = 0; i < 100 && !demo.snapshot().tasks[0].awaitingDecision; i++) await sleep(5);
  await sleep(20);
  assert.equal(demo.snapshot().tasks[0].awaitingDecision, true);
  assert.equal(demo.snapshot().tasks[1].status, "succeeded");
  assert.equal(demo.snapshot().complete, false);
  assert.equal(demo.snapshot(["1"]).tasks.length, 1);
  demo.resume("0", { chosen: "article" });
  const final = await finished(demo);
  assert.equal(JSON.stringify(final.tasks[0].result), JSON.stringify({ chosen: "article" }));
  assert.throws(() => demo.resume("0", {}), /not awaiting/);
});

test("a failed worker releases its tab and does not discard other results", async () => {
  const { demo } = runner(["hn", "hn", "daily"]);
  demo.enqueue("0", async () => { throw new Error("site unavailable"); });
  demo.enqueue("1", async () => ({ ok: true }));
  demo.enqueue("2", async () => undefined);
  const final = await finished(demo);
  assert.equal(final.tasks[0].status, "failed");
  assert.equal(final.tasks[1].status, "succeeded");
  assert.equal(final.tasks[2].status, "failed");
  assert.throws(() => demo.enqueue("0", async () => ({})), /already submitted/);
  assert.throws(() => demo.enqueue("unknown", async () => ({})), /Unknown task/);
});

test("snapshot copies cannot mutate scheduler records", async () => {
  const { demo } = runner(["hn"]);
  demo.snapshot().tasks[0].status = "succeeded";
  assert.equal(demo.snapshot().tasks[0].status, "pending");
});

test("missing evidence fails and bounded retries repair it on the same tab", async () => {
  const { demo, pages } = runner(["wiki"], 3, 1500, ["definition"]);
  demo.enqueue("0", async () => ({ definition: [] }));
  assert.throws(() => demo.retry("0", async () => ({})), /terminal/);
  assert.equal((await finished(demo)).tasks[0].status, "failed");
  demo.retry("0", async () => ({ definition: "  " }));
  assert.equal((await finished(demo)).tasks[0].status, "failed");
  demo.retry("0", async () => ({ definition: "A sourced definition." }));
  const final = await finished(demo);
  assert.equal(final.tasks[0].status, "succeeded");
  assert.equal(final.tasks[0].attempt, 3);
  assert.equal(final.tasks[0].history.length, 2);
  assert.ok(final.tasks[0].history.every(attempt => attempt.status === "failed"));
  assert.equal(pages.length, 1);
  assert.throws(() => demo.retry("0", async () => ({})), /Maximum three/);
});

const mcpResponse = (payload: unknown) => ({ content: [{ type: "text", text: JSON.stringify(payload) }] });
test("MCP payloads and REPL failure signals are handled explicitly", () => {
  assert.deepEqual(textPayload(mcpResponse({ session_id: "one" })), { session_id: "one" });
  assert.deepEqual(replPayload(mcpResponse({ success: true, content: [{ type: "text", channel: "write", text: '{"active":2}' }] })), { active: 2 });
  assert.throws(() => textPayload({ isError: true, content: [] }), /operation failed/);
  assert.throws(() => replPayload(mcpResponse({ success: true, repl_terminated: true })), /state lost/);
  assert.throws(() => replPayload(mcpResponse({ success: true, content_truncated: true })), /truncated/);
});
