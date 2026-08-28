/**
 * Recipe: lead intel.
 *
 * Researches a sales lead's website in parallel. A coordinator managed agent
 * identifies independent research questions and delegates each to a
 * browser-operator subagent (its own Kernel cloud browser), then synthesizes a
 * cited lead-intelligence brief.
 *
 * Pure TypeScript: ONE cloud session (against the coordinator), streamed; the
 * parallel subagents live inside it as threads. The coordinator + worker agents
 * are found-or-created (by recipe-specific name) on each run.
 *
 * Requires `npm run setup` first, plus ANTHROPIC_API_KEY + KERNEL_API_KEY.
 * Run with: npm run lead-intel -- <url>
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
  console.error("Usage: npm run lead-intel -- <url>");
  console.error("Example: npm run lead-intel -- https://acme.com");
  process.exit(1);
}

const prompt = `Build a lead-intelligence brief on this sales prospect: ${url}.

1. Recon the site YOURSELF with a Kernel browser (NOT web_fetch — the site is
   likely JS-rendered; use \`kernel browsers create\` + \`playwright execute\` to read
   the rendered links/nav, as your instructions describe), then pick the independent
   research questions worth answering, e.g.: product lineup & key features, pricing &
   packaging, how they meter / measure usage, target segments & ideal customer,
   positioning & messaging, notable integrations, and named customers / logos. Note
   which page(s) each question needs. (Do recon with one browser yourself; don't
   spend a subagent on it.)
2. Delegate EACH question to its own browser-operator subagent, running them in
   PARALLEL. Give each a precise brief: open its own Kernel browser, navigate the
   relevant pages, and extract concrete, CITED evidence (exact quotes, prices,
   plan names, screenshots, URLs). Give each operator a HARD ${OPERATOR_TIMEBOX_MIN}-minute
   timebox: it must return its best, well-cited evidence within ${OPERATOR_TIMEBOX_MIN}
   minutes even if partial, so one slow question can't stall the whole brief.
3. When every operator has reported, synthesize a structured LEAD-INTEL BRIEF:
   one section per question with findings + cited evidence, plus a short
   "so what for sales" summary at the top.

Never print KERNEL_API_KEY — it is an opaque placeholder.`;

// This recipe needs a coordinator + one browser-operator worker, named for the
// recipe (so they're never shared with another recipe). find-or-create-or-update.
async function main() {
  const workerId = await findOrCreateAgent(
    workerAgentParams("lead-intel-worker"),
  );
  const coordinatorId = await findOrCreateAgent(
    coordinatorAgentParams("lead-intel-coordinator", workerId),
  );
  await runManagedAgent({
    agentId: coordinatorId,
    task: prompt,
    title: `Lead intel: ${url}`,
  });
}

main().then(
  () => console.error("\nlead-intel finished."),
  (err) => {
    console.error("\nlead-intel failed:", err);
    process.exitCode = 1;
  },
);
