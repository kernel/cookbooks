import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import { replPayload, textPayload } from "./mcp.js";
import { selectModel } from "./model.js";
import { formatTimeline, peakOverlap, runPool } from "./schedule.js";

test("model routing keeps Sonnet 5.5 fixed and honors explicit route selection", () => {
  assert.equal(selectModel({ ANTHROPIC_API_KEY: "test" }).model.modelId, "claude-sonnet-5-5");
  assert.equal(selectModel({ AI_GATEWAY_API_KEY: "test" }).model.modelId, "anthropic/claude-sonnet-5.5");
  assert.equal(selectModel({ ANTHROPIC_API_KEY: "test", AI_GATEWAY_API_KEY: "test" }).route, "anthropic");
  assert.equal(selectModel({ ANTHROPIC_API_KEY: "test", AI_GATEWAY_API_KEY: "test", MODEL_ROUTE: "gateway" }).route, "gateway");
  assert.throws(() => selectModel({}), /Set ANTHROPIC_API_KEY/);
  assert.throws(() => selectModel({ AI_GATEWAY_API_KEY: "test", MODEL_ROUTE: "anthropic" }), /No model fallback/);
});

type Page = { closed: boolean; name: string };
type Job = { done: boolean; output: string; error?: string };
type Code = (page: Page, state: Record<string, unknown>, repl: { write(value: unknown): void }) => unknown;
type Runner = { open(id: string): Promise<unknown>; close(id: string): Promise<unknown>; start(id: string, fn: Code): number; poll(id: number): Job };

const source = await readFile(new URL("runtime.js", import.meta.url), "utf8");
function runner(options = {}) {
  const pages: Page[] = [];
  const context = {
    async newPage() {
      const page = { closed: false, name: `tab-${pages.length}`, setDefaultTimeout() {}, setDefaultNavigationTimeout() {},
        async close() { page.closed = true; } };
      pages.push(page);
      return page;
    },
  };
  const create: (context: object, options: object) => Runner = runInNewContext(source + "\ncreateTabRunner", { setTimeout, clearTimeout });
  return { tabs: create(context, options), pages };
}

async function settle(tabs: Runner, jobId: number) {
  for (let i = 0; i < 200; i++) {
    const job = tabs.poll(jobId);
    if (job.done) return job;
    await sleep(5);
  }
  throw new Error("Job did not finish");
}

test("each task gets its own tab, and jobs on different tabs overlap", async () => {
  const { tabs, pages } = runner();
  await tabs.open("a");
  await tabs.open("b");
  await assert.rejects(tabs.open("a"), /already open/);
  const seen: string[] = [];
  let running = 0, peak = 0;
  const code: Code = async page => {
    peak = Math.max(peak, ++running);
    seen.push(page.name);
    await sleep(20);
    running--;
    return page.name;
  };
  const jobs = [tabs.start("a", code), tabs.start("b", code)];
  assert.equal(tabs.poll(jobs[0]).done, false);
  const results = await Promise.all(jobs.map(job => settle(tabs, job)));
  assert.deepEqual(results.map(job => job.output), ["tab-0", "tab-1"]);
  assert.equal(peak, 2);
  assert.deepEqual(seen.sort(), ["tab-0", "tab-1"]);
  await tabs.close("a");
  assert.equal(pages[0].closed, true);
  assert.throws(() => tabs.start("a", code), /No open tab/);
});

test("state persists per tab and writes are collected", async () => {
  const { tabs } = runner();
  await tabs.open("a");
  await tabs.open("b");
  await settle(tabs, tabs.start("a", async (_page, state) => { state.count = 1; }));
  const job = await settle(tabs, tabs.start("a", async (_page, state, repl) => { repl.write("count="); return state.count; }));
  assert.equal(job.output, "count=1");
  assert.equal((await settle(tabs, tabs.start("b", async (_page, state) => state.count ?? "empty"))).output, "empty");
});

test("errors, timeouts, and large output are reported without breaking the tab", async () => {
  const { tabs } = runner({ jobTimeoutMs: 30, maxOutputChars: 10 });
  await tabs.open("a");
  assert.equal((await settle(tabs, tabs.start("a", async () => { throw new Error("selector missed"); }))).error, "selector missed");
  assert.match((await settle(tabs, tabs.start("a", () => sleep(100)))).error ?? "", /still running/);
  assert.equal((await settle(tabs, tabs.start("a", async () => "x".repeat(50)))).output, "xxxxxxxxxx [output truncated]");
  const job = tabs.start("a", async () => "ok");
  await settle(tabs, job);
  assert.throws(() => tabs.poll(job), /Unknown job/);
});

test("the pool never runs more than its limit and runs every item", async () => {
  let running = 0, peak = 0;
  const done: number[] = [];
  await runPool([1, 2, 3, 4, 5], 2, async item => {
    peak = Math.max(peak, ++running);
    await sleep(5 * item);
    running--;
    done.push(item);
  });
  assert.equal(peak, 2);
  assert.deepEqual(done.sort(), [1, 2, 3, 4, 5]);
});

test("the timeline reports overlap", () => {
  const spans = [
    { id: "a", status: "succeeded", steps: 4, startedAt: 0, finishedAt: 10_000 },
    { id: "bb", status: "failed", steps: 20, startedAt: 5_000, finishedAt: 20_000 },
    { id: "c", status: "succeeded", steps: 2, startedAt: 10_000, finishedAt: 12_000 },
  ];
  assert.equal(peakOverlap(spans), 2);
  const timeline = formatTimeline(spans, 20);
  assert.match(timeline, /^a  \|██████████ {10}\| succeeded in 10s, 4 steps$/m);
  assert.match(timeline, /bb \| {5}█{15}\| failed in 15s, 20 steps/);
  assert.match(timeline, /Peak tabs open at once: 2/);
});

const mcpResponse = (payload: unknown) => ({ content: [{ type: "text", text: JSON.stringify(payload) }] });
test("MCP payloads and REPL failure signals are handled explicitly", () => {
  assert.deepEqual(textPayload(mcpResponse({ session_id: "one" })), { session_id: "one" });
  assert.deepEqual(replPayload(mcpResponse({ success: true, content: [{ type: "text", channel: "write", text: '{"active":2}' }] })), { active: 2 });
  assert.throws(() => textPayload({ isError: true, content: [] }), /operation failed/);
  assert.throws(() => replPayload(mcpResponse({ success: true, repl_terminated: true })), /state lost/);
  assert.throws(() => replPayload(mcpResponse({ success: true, content_truncated: true })), /truncated/);
});
