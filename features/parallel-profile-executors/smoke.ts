import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import Kernel from "@onkernel/sdk";
import { formatTimeline, type Span } from "./schedule.js";

const kernel = new Kernel();
const directory = new URL("./artifacts/executor-smoke/", import.meta.url);
await mkdir(directory, { recursive: true, mode: 0o700 });
const profile = await kernel.profiles.create({ name: `executor-smoke-${randomUUID()}` });
let seedSessionId: string | undefined;
let sessionId: string | undefined;
try {
  const seed = await kernel.browsers.create({ headless: false, stealth: true, timeout_seconds: 120,
    profile: { id: profile.id, save_changes: true } });
  seedSessionId = seed.session_id;
  const seeded = await kernel.browsers.playwright.execute(seedSessionId, {
    code: `
      await page.goto("https://example.com/one");
      const second = await context.newPage();
      const third = await context.newPage();
      await Promise.all([second.goto("https://example.com/two"), third.goto("https://example.com/three")]);
      return context.pages().length;
    `,
    timeout_sec: 60,
  });
  assert.equal(seeded.success, true);
  assert.equal(seeded.result, 3);
  await kernel.browsers.deleteByID(seedSessionId);
  seedSessionId = undefined;

  const browser = await kernel.browsers.create({ headless: false, stealth: true, timeout_seconds: 120,
    start_url: "https://duckduckgo.com/", profile: { id: profile.id, save_changes: true } });
  sessionId = browser.session_id;
  await writeFile(new URL("session.json", directory), JSON.stringify({ sessionId,
    liveView: browser.browser_live_view_url }, null, 2), { mode: 0o600 });

  const startup = await kernel.browsers.playwright.execute(sessionId, {
    code: `
      await page.waitForURL(url => url.hostname.endsWith("duckduckgo.com"), { waitUntil: "commit" });
      return context.pages().map(candidate => candidate.url());
    `,
    timeout_sec: 60,
  });
  assert.equal(startup.success, true);
  const startupUrls = startup.result as string[];
  assert.equal(startupUrls.length, 1);
  assert.match(startupUrls[0], /^https:\/\/([^/]+\.)?duckduckgo\.com\//);

  const ids = ["one", "two", "three"];
  const spans: Span[] = await Promise.all(ids.map(async id => {
    const startedAt = Date.now();
    const first = await kernel.browsers.playwright.execute(sessionId!, { executor: id, timeout_sec: 60,
      code: `await page.goto("https://example.com"); await page.waitForTimeout(3000); return { id: ${JSON.stringify(id)}, url: page.url() };` });
    assert.equal(first.success, true);
    assert.deepEqual(first.result, { id, url: "https://example.com/" });
    assert.equal(first.tab?.created, true);
    const targetId = first.tab?.target_id;
    const second = await kernel.browsers.playwright.execute(sessionId!, { executor: id, timeout_sec: 60, code: "return page.url();" });
    assert.equal(second.result, "https://example.com/");
    assert.equal(second.tab?.created, false);
    assert.equal(second.tab?.target_id, targetId);
    return { id, status: "succeeded", steps: 2, startedAt, finishedAt: Date.now() };
  }));

  const active = await kernel.browsers.playwright.executors.list(sessionId);
  assert.deepEqual(active.executors.filter(executor => executor.name !== "default").map(executor => executor.name).sort(),
    ["one", "three", "two"]);
  await Promise.all(ids.map(id => kernel.browsers.playwright.executors.delete(id, { id_or_name: sessionId! })));
  const remaining = await kernel.browsers.playwright.executors.list(sessionId);
  assert.deepEqual(remaining.executors.map(executor => executor.name), ["default"]);

  console.log(formatTimeline(spans));
  const wall = Math.max(...spans.map(span => span.finishedAt)) - Math.min(...spans.map(span => span.startedAt));
  assert.ok(wall < 8000, `three 3s executor calls took ${wall}ms; they did not overlap`);
  console.log("PASS: DuckDuckGo start_url replaced restored tabs; three named executors overlapped, retained their tabs, and were deleted");
} finally {
  try {
    try { if (sessionId) await kernel.browsers.deleteByID(sessionId); }
    finally { if (seedSessionId) await kernel.browsers.deleteByID(seedSessionId); }
  } finally {
    await kernel.profiles.delete(profile.id);
  }
}
