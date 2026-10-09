import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { createResultPublisher, formatBriefing, normalizeSubmission, type Outcome, type RunEvent, type Submission } from "./results.js";

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

test("submissions are normalized from loose model output", () => {
  assert.deepEqual(normalizeSubmission(null), { summary: "", findings: [], limitations: [] });
  assert.deepEqual(normalizeSubmission({
    summary: 42,
    findings: [{ text: "kept", url: "https://example.com" }, { text: "no url" }, { text: 1, url: "https://example.com" }, "bare", null],
    limitations: "only one page",
  }), { summary: "42", findings: [{ text: "kept", url: "https://example.com" }], limitations: ["only one page"] });
});

const done = (id: string, result: Submission): Outcome =>
  ({ id, site: "s", status: "succeeded", steps: 1, startedAt: 0, finishedAt: 1, result });

test("the briefing covers no completed tasks and tasks without findings", () => {
  assert.equal(formatBriefing([{ id: "a", site: "s", status: "running", steps: 0, startedAt: 0, finishedAt: 0 }]),
    "# Partial briefing\n\nNo tasks have completed yet.\n");
  assert.equal(formatBriefing([done("a", { summary: "Nothing new.", findings: [], limitations: ["Paywalled"] })]),
    "# Partial briefing\n\n## a\n\nNothing new.\n\nNo findings.\n\nLimitations:\n\n- Paywalled\n");
});

test("the briefing escapes finding text and links only web URLs", () => {
  const briefing = formatBriefing([done("a", { summary: "", limitations: [], findings: [
    { text: "Fix [CVE]\nshipped", url: "https://example.com/a b (c)" },
    { text: "<b>bold</b>", url: "javascript:alert(1)" },
  ] })]);
  assert.deepEqual(briefing.split("\n").filter(line => line.startsWith("- ")), [
    String.raw`- [Fix \[CVE\] shipped](<https://example.com/a%20b%20(c)>)`,
    String.raw`- \<b\>bold\</b\> (javascript:alert(1))`,
  ]);
});
