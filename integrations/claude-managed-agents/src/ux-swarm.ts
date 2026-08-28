/**
 * Recipe: UX swarm.
 *
 * Audits a website's UX in parallel. A coordinator managed agent decomposes the
 * site into distinct areas/flows and delegates each to a browser-operator
 * subagent — each driving its OWN Kernel cloud browser via computer use /
 * Playwright — then synthesizes their findings into one prioritized UX report.
 *
 * Pure TypeScript: it opens ONE cloud session (against the coordinator) and
 * streams it; the parallel subagents live inside that single session as threads.
 * The coordinator + worker agents are created on first run (config.ensureAgents).
 *
 * Requires `npm run setup` first, plus ANTHROPIC_API_KEY + KERNEL_API_KEY.
 * Run with: npm run ux-swarm -- <url>
 */
import {
  findOrCreateAgent,
  workerAgentParams,
  coordinatorAgentParams,
  runManagedAgent,
  OPERATOR_TIMEBOX_MIN,
} from "./config";

const url = process.argv[2];
if (!url) {
  console.error("Usage: npm run ux-swarm -- <url>");
  console.error("Example: npm run ux-swarm -- https://example.com");
  process.exit(1);
}

const prompt = `Run a parallel UX audit of ${url}.

1. Recon the site YOURSELF with a Kernel browser (NOT web_fetch — the site is
   likely JS-rendered; use \`kernel browsers create\` + \`playwright execute\` to read
   the rendered links/nav, as your instructions describe). ENUMERATE its individual
   pages — landing, pricing, docs home, sign-up, log-in, key product/feature pages,
   blog, changelog, etc. Produce a concrete list of page URLs to audit. (Do recon
   with one browser yourself; don't spend a subagent on it.)
2. Hand EACH page to its OWN browser-operator subagent — exactly ONE page per
   operator (do not give any operator more than one page) — and run them ALL in
   PARALLEL. Brief each one to open its own Kernel browser (stealth, non-headless)
   and audit that single page using a COMBINATION of Playwright, computer-use
   controls, and screenshots, reporting concrete UX findings with evidence — what
   works, what's confusing or broken, slow loads, layout/contrast issues, dead
   links, etc. Give each operator a HARD ${OPERATOR_TIMEBOX_MIN}-minute timebox: it
   must return its best, well-cited findings within ${OPERATOR_TIMEBOX_MIN} minutes
   even if partial, so one slow page can't stall the whole audit.
3. When every operator has reported, synthesize a single PRIORITIZED UX REPORT:
   issues ranked by severity, each tagged with its page and supporting evidence,
   followed by the top recommendations.

Never print KERNEL_API_KEY — it is an opaque placeholder.`;

// This recipe needs a coordinator + one browser-operator worker, named for the
// recipe (so they're never shared with another recipe). find-or-create-or-update.
async function main() {
  const workerId = await findOrCreateAgent(
    workerAgentParams("ux-swarm-worker"),
  );
  const coordinatorId = await findOrCreateAgent(
    coordinatorAgentParams("ux-swarm-coordinator", workerId),
  );
  await runManagedAgent({
    agentId: coordinatorId,
    task: prompt,
    title: `UX swarm: ${url}`,
  });
}

main().then(
  () => console.error("\nux-swarm finished."),
  (err) => {
    console.error("\nux-swarm failed:", err);
    process.exitCode = 1;
  },
);
