import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { createResultPublisher, type RunEvent } from "./results.js";

test("the publisher keeps publishing after a failed write", async t => {
  const errors = t.mock.method(console, "error", () => {});
  const outputDir = pathToFileURL(join(await mkdtemp(join(tmpdir(), "publisher-")), "missing") + "/");
  const events: RunEvent[] = [];
  const publisher = createResultPublisher(outputDir, () => ({}), () => "", event => events.push(event));
  const event = (taskId: string): RunEvent => ({ type: "task_started", taskId, executor: taskId, at: "" });

  await publisher.publish(event("a"));
  assert.equal(errors.mock.callCount(), 1);
  assert.equal(events.length, 0);

  await mkdir(outputDir);
  await publisher.publish(event("b"));
  assert.deepEqual(events.map(event => event.taskId), ["b"]);
  assert.equal(JSON.parse(await readFile(new URL("updates.jsonl", outputDir), "utf8")).taskId, "b");
});
