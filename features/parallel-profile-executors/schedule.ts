export async function runPool<T>(items: T[], limit: number, worker: (item: T, lane: number) => Promise<void>, signal?: AbortSignal) {
  const queue = [...items];
  const lanes = Array.from({ length: Math.min(limit, queue.length) }, async (_, lane) => {
    while (queue.length && !signal?.aborted) await worker(queue.shift()!, lane);
  });
  await Promise.all(lanes);
}

export type Span = { id: string; status: string; steps: number; startedAt: number; finishedAt: number };

export function peakOverlap(spans: Span[]) {
  const edges = spans.flatMap(span => [[span.startedAt, 1], [span.finishedAt, -1]]);
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let open = 0, peak = 0;
  for (const [, delta] of edges) peak = Math.max(peak, open += delta);
  return peak;
}

export function formatTimeline(spans: Span[], width = 50) {
  if (!spans.length) return "No tasks ran.";
  const start = Math.min(...spans.map(span => span.startedAt));
  const total = Math.max(1, Math.max(...spans.map(span => span.finishedAt)) - start);
  const label = Math.max(...spans.map(span => span.id.length));
  const column = (time: number) => Math.round(((time - start) / total) * width);
  const rows = spans.map(span => {
    const from = column(span.startedAt);
    const bar = " ".repeat(from) + "█".repeat(Math.max(1, column(span.finishedAt) - from));
    const seconds = ((span.finishedAt - span.startedAt) / 1000).toFixed(0);
    return `${span.id.padEnd(label)} |${bar.padEnd(width)}| ${span.status} in ${seconds}s, ${span.steps} steps`;
  });
  return [...rows, `${"".padEnd(label)}  0s${`${(total / 1000).toFixed(0)}s`.padStart(width - 2)}`,
    `Peak tasks active at once: ${peakOverlap(spans)}`].join("\n");
}
