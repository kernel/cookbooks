// Transport/runtime smoke test, deliberately without a model. Not an agent eval.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import Kernel from "@onkernel/sdk";
import { connectKernel, object, replPayload, textPayload } from "./mcp.js";
import { TASKS } from "./tasks.js";

const kernel = new Kernel({ maxRetries: 0 });
const mcp = await connectKernel();
const directory = new URL("./artifacts/mcp-smoke/", import.meta.url);
await mkdir(directory, { recursive: true, mode: 0o700 });
const metadata = new URL("session.json", directory);
try {
  if (process.argv[2] === "prepare" || !process.argv[2]) {
    const profile = await kernel.profiles.create({ name: `mcp-smoke-${randomUUID()}` });
    let sessionId: string | undefined;
    try {
      const payload = object(textPayload(await mcp.call("manage_browsers", {
        action: "create", name: profile.name, profile_id: profile.id,
        save_profile_changes: true, headless: false, timeout_seconds: 300, start_url: "https://example.com",
      })));
      const response = object(payload.browser);
      assert.equal(typeof response.session_id, "string");
      assert.equal(response.profile_save_changes, true);
      sessionId = response.session_id as string;
      const replay = await kernel.browsers.replays.start(sessionId);
      await writeFile(metadata, JSON.stringify({ sessionId, profileId: profile.id, replayId: replay.replay_id,
        liveView: response.browser_live_view_url, replay: replay.replay_view_url }), { mode: 0o600 });
      console.log(JSON.stringify({ sessionId, profileId: profile.id, metadata: metadata.pathname }));
    } catch (error) {
      await kernel.browsers.deleteByID(sessionId ?? profile.name!).catch(() => undefined);
      await kernel.profiles.delete(profile.id);
      throw error;
    }
  }
  if (process.argv[2] === "run" || !process.argv[2]) {
    const saved = JSON.parse(await readFile(metadata, "utf8")) as { sessionId: string; profileId: string; replayId: string };
    const { sessionId, profileId, replayId } = saved;
    const tasks = TASKS.filter(task => ["top-stories", "industry-context", "practical-lessons"].includes(task.id))
      .map(({ requiredFields, ...task }) => task);
    const repl = async (code: string, id = sessionId) => replPayload(await mcp.call("browser_repl", { session_id: id, code, timeout_sec: 30 }));
    try {
      const runtime = await readFile(new URL("runtime.js", import.meta.url), "utf8");
      console.log("bootstrap", await repl(`
        var playwright = await import("patchright");
        var pwBrowser = await playwright.chromium.connectOverCDP(process.env.CDP_ENDPOINT);
        var pwContext = pwBrowser.contexts()[0];
        ${runtime}
        var demo = createTaskRunner(${JSON.stringify({ tasks, maxActive: 3, seed: 1500, runId: "mcp-smoke" })}, pwContext);
        ${tasks.map(task => `demo.enqueue(${JSON.stringify(task.id)}, async (page, task, checkpoint) => {
          await page.goto(task.url, { waitUntil: "domcontentloaded" });
          var evidence = { title: await page.title(), url: page.url() };
          await checkpoint(evidence);
          return evidence;
        });`).join("\n")}
        repl.write(JSON.stringify({ ready: true }));
      `));
      let state;
      for (let attempt = 0; attempt < 60; attempt++) {
        state = object(await repl("repl.write(JSON.stringify(demo.snapshot()));"));
        const records = (state.tasks as unknown[]).map(object);
        if (records.every(task => task.awaitingDecision === true)) break;
        assert.ok(!records.some(task => task.status === "failed"), JSON.stringify(records));
        await sleep(1000);
      }
      assert.equal(state?.active, 3);
      assert.equal(state?.peakActive, 3);
      await repl('repl.write(JSON.stringify(demo.resume("top-stories", {continue:true})));');
      await sleep(500);
      const partial = object(await repl("repl.write(JSON.stringify(demo.snapshot()));"));
      await writeFile(new URL("partial.json", directory), JSON.stringify(partial, null, 2));
      assert.equal(partial.active, 2);
      assert.equal((partial.tasks as unknown[]).map(object).find(task => task.id === "top-stories")?.status, "succeeded");
      await repl('demo.resume("industry-context", {}); demo.resume("practical-lessons", {}); repl.write(JSON.stringify({resumed:true}));');
      await sleep(500);
      const final = object(await repl("repl.write(JSON.stringify(demo.snapshot()));"));
      await writeFile(new URL("results.json", directory), JSON.stringify(final, null, 2));
      assert.equal(final.complete, true);
      assert.ok((final.tasks as unknown[]).map(object).every(task => task.status === "succeeded"));
      console.log("PASS: MCP bootstrap, three concurrent pages, checkpoints, independent partial results, all workers finished");
    } finally {
      try {
        await kernel.browsers.replays.stop(replayId, { id_or_name: sessionId });
        const response = await kernel.browsers.replays.download(replayId, { id_or_name: sessionId });
        await writeFile(new URL("replay.mp4", directory), Buffer.from(await response.arrayBuffer()));
      } finally {
        await kernel.browsers.deleteByID(sessionId);
        await kernel.profiles.delete(profileId);
      }
    }
  } else if (process.argv[2] !== "prepare") throw new Error("Use smoke.ts with no arguments for the complete test");
} finally { await mcp.client.close(); }
