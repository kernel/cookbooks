import { appendFile, writeFile } from "node:fs/promises";

export type Submission = {
  summary: string;
  findings: Array<{ text: string; url: string }>;
  limitations: string[];
};

export type Outcome = {
  id: string;
  site: string;
  status: "queued" | "running" | "succeeded" | "failed";
  steps: number;
  startedAt: number;
  finishedAt: number;
  result?: Submission;
  error?: string;
  cleanupError?: string;
};

export type RunEvent =
  | { type: "task_started"; taskId: string; executor: string; at: string }
  | { type: "agent_step"; taskId: string; step: number; tools: string[]; at: string }
  | { type: "task_completed"; taskId: string; cleanupError?: string; at: string }
  | { type: "task_failed"; taskId: string; error: string; cleanupError?: string; at: string };

export function normalizeSubmission(value: unknown): Submission {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const findings = Array.isArray(input.findings) ? input.findings.flatMap(finding => {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) return [];
    const item = finding as Record<string, unknown>;
    return typeof item.text === "string" && typeof item.url === "string"
      ? [{ text: item.text, url: item.url }] : [];
  }) : [];
  const limitations = Array.isArray(input.limitations)
    ? input.limitations.map(String)
    : input.limitations == null ? [] : [String(input.limitations)];
  return { summary: String(input.summary ?? ""), findings, limitations };
}

const escapeMarkdown = (text: string) => text.replace(/\s+/g, " ").trim().replace(/[\\[\]<>]/g, "\\$&");

function formatFinding({ text, url }: Submission["findings"][number]) {
  const href = URL.canParse(url) ? new URL(url) : undefined;
  return href?.protocol === "http:" || href?.protocol === "https:"
    ? `- [${escapeMarkdown(text)}](<${href.href}>)`
    : `- ${escapeMarkdown(text)} (${escapeMarkdown(url)})`;
}

export function formatBriefing(outcomes: Outcome[]) {
  const completed = outcomes.filter(outcome => outcome.status === "succeeded" && outcome.result);
  const sections = completed.map(outcome => {
    const findings = outcome.result!.findings.map(formatFinding).join("\n");
    const limitations = outcome.result!.limitations.map(limitation => `- ${limitation}`).join("\n");
    return `## ${outcome.id}\n\n${outcome.result!.summary}\n\n${findings || "No findings."}` +
      (limitations ? `\n\nLimitations:\n\n${limitations}` : "");
  });
  return `# Partial briefing\n\n${sections.join("\n\n") || "No tasks have completed yet."}\n`;
}

export function createResultPublisher(
  outputDir: URL,
  snapshot: () => unknown,
  briefing: () => string,
  onEvent: (event: RunEvent) => void,
) {
  let writes = Promise.resolve();
  return {
    publish(event: RunEvent) {
      writes = writes.then(async () => {
        await appendFile(new URL("updates.jsonl", outputDir), JSON.stringify(event) + "\n");
        await writeFile(new URL("snapshot.json", outputDir), JSON.stringify(snapshot(), null, 2));
        await writeFile(new URL("briefing.md", outputDir), briefing());
        onEvent(event);
      }).catch(error => console.error(`Could not publish ${event.type} for ${event.taskId}: ${String(error)}`));
      return writes;
    },
  };
}
