import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTimeline, peakOverlap, runPool } from "./schedule.js";

test("the pool starts another task only after a running task releases its slot", async () => {
  const releases = new Map<number, () => void>();
  const started: number[] = [];
  let running = 0, peak = 0;
  const run = runPool([1, 2, 3], 2, async item => {
    started.push(item);
    peak = Math.max(peak, ++running);
    await new Promise<void>(resolve => releases.set(item, resolve));
    running--;
  });

  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, [1, 2]);
  assert.equal(peak, 2);

  releases.get(1)!();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, [1, 2, 3]);

  releases.get(2)!();
  releases.get(3)!();
  await run;
});

test("the pool starts no queued tasks after it is aborted", async () => {
  const abort = new AbortController();
  const started: number[] = [];
  await runPool([1, 2, 3, 4], 2, async item => {
    started.push(item);
    await Promise.resolve();
    abort.abort();
  }, abort.signal);
  assert.deepEqual(started, [1, 2]);
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
  assert.match(timeline, /Peak tasks active at once: 2/);
});
