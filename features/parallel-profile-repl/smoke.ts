// Live check of the tab runner against Kernel, without a model. Not an agent eval.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Kernel from "@onkernel/sdk";
import { connectKernel, openTabRunner } from "./mcp.js";
import { formatTimeline, type Span } from "./schedule.js";

const kernel = new Kernel();
const mcp = await connectKernel();
const profile = await kernel.profiles.create({ name: `mcp-smoke-${randomUUID()}` });
let sessionId: string | undefined;
try {
  const browser = await kernel.browsers.create({ headless: false, timeout_seconds: 120, profile: { id: profile.id, save_changes: true } });
  sessionId = browser.session_id;
  const tabs = await openTabRunner(mcp, sessionId);
  const ids = ["one", "two", "three"];
  const spans: Span[] = await Promise.all(ids.map(async id => {
    const startedAt = Date.now();
    await tabs.open(id);
    const first = await tabs.run(id, `await page.goto("https://example.com"); await page.waitForTimeout(4000); state.id = ${JSON.stringify(id)}; return page.url();`);
    assert.equal(first.error, undefined);
    assert.equal(first.output, "https://example.com/");
    const second = await tabs.run(id, "return state.id;");
    assert.equal(second.output, id);
    const broken = await tabs.run(id, "await page.locator('#missing').click({ timeout: 500 });");
    assert.match(broken.error ?? "", /Timeout/);
    await tabs.close(id);
    return { id, status: "succeeded", steps: 3, startedAt, finishedAt: Date.now() };
  }));
  console.log(formatTimeline(spans));
  const wall = Math.max(...spans.map(span => span.finishedAt)) - Math.min(...spans.map(span => span.startedAt));
  assert.ok(wall < 12000, `three 4s tab jobs took ${wall}ms; they did not overlap`);
  console.log("PASS: three tabs in one browser ran overlapping jobs with per-tab state and isolated errors");
} finally {
  try { if (sessionId) await kernel.browsers.deleteByID(sessionId); }
  finally {
    await kernel.profiles.delete(profile.id);
    await mcp.client.close();
  }
}
