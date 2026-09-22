#!/usr/bin/env node
import "dotenv/config";
import Kernel from "@onkernel/sdk";

const FX_MODEL = process.env.FX_MODEL ?? "anthropic/claude-sonnet-4.5";
const FX_TASK =
  process.env.FX_TASK ??
  "Go to https://news.ycombinator.com and tell me the top 5 article titles.";
const LIBFX_VERSION = process.env.LIBFX_VERSION ?? "0.0.10";
const BROWSER_TIMEOUT_SECONDS = Number(process.env.BROWSER_TIMEOUT_SECONDS ?? 900);
const PROCESS_TIMEOUT_SECONDS = Number(process.env.PROCESS_TIMEOUT_SECONDS ?? 60);
const REPL_TIMEOUT_SECONDS = Number(process.env.REPL_TIMEOUT_SECONDS ?? 90);

const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;
if (!AI_GATEWAY_API_KEY) {
  throw new Error("set AI_GATEWAY_API_KEY before running this script");
}

const kernel = new Kernel();

// Sent to the browser's persistent REPL; `config` is spliced in as JSON below.
const AGENT_SCRIPT = `
const { createFxAgent } = await import('libfx');

let lastSnapshot = null;

function findNode(backendNodeId) {
  const node = lastSnapshot?.nodes?.find((n) => n.backendNodeId === backendNodeId);
  if (!node) throw new Error(\`unknown backendNodeId: \${backendNodeId} (call snapshot first)\`);
  return node;
}

const tools = [
  {
    name: 'goto',
    description: 'Navigate the browser to a URL and wait for the page to finish loading.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    async execute({ url }) {
      await gotoUrl(url);
      await waitForLoad();
      return await pageInfo();
    },
  },
  {
    name: 'snapshot',
    description:
      'Accessibility tree snapshot of the current page. Nodes carry a backendNodeId, ' +
      'role, and name; pass backendNodeId to click or type. Re-snapshot after any ' +
      'navigation or action, since backendNodeIds go stale once the DOM changes.',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      lastSnapshot = await accessibilitySnapshot();
      return lastSnapshot;
    },
  },
  {
    name: 'click',
    description: 'Click a node returned by the most recent snapshot call.',
    inputSchema: {
      type: 'object',
      properties: { backendNodeId: { type: 'integer' } },
      required: ['backendNodeId'],
    },
    async execute({ backendNodeId }) {
      await click(findNode(backendNodeId));
      return { ok: true };
    },
  },
  {
    name: 'type',
    description: 'Fill an input node returned by the most recent snapshot call, optionally pressing Enter afterward.',
    inputSchema: {
      type: 'object',
      properties: {
        backendNodeId: { type: 'integer' },
        text: { type: 'string' },
        submit: { type: 'boolean' },
      },
      required: ['backendNodeId', 'text'],
    },
    async execute({ backendNodeId, text, submit }) {
      await fillInput(findNode(backendNodeId), text);
      if (submit) await pressKey('Enter');
      return { ok: true };
    },
  },
  {
    name: 'js',
    description: 'Evaluate a JavaScript function body against the page and return its result.',
    inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
    async execute({ code }) {
      return await js(new Function(code));
    },
  },
];

const agent = await createFxAgent({
  apiKey: config.apiKey,
  model: config.model,
  instructions: 'You control a live Chromium browser through the tools provided.',
  tools,
});

const turn = agent.prompt(config.task);
let text = '';
for await (const event of turn) {
  if (event.type === 'text_delta') text += event.delta;
}
const result = await turn.result;
await agent.close();

repl.write(JSON.stringify({ text, stopReason: result.stopReason, usage: result.usage }));
`;

async function main() {
  const browser = await kernel.browsers.create({ timeout_seconds: BROWSER_TIMEOUT_SECONDS });
  console.log(`browser session: ${browser.session_id}`);
  console.log(`live view: ${browser.browser_live_view_url}`);

  try {
    // --use-openssl-ca: this VM's Node has a stale bundled CA store that can't
    // verify the registry's current cert chain, even though curl verifies it fine.
    const install = await kernel.browsers.process.exec(browser.session_id, {
      command: "npm",
      args: ["install", "-g", `libfx@${LIBFX_VERSION}`],
      env: { NODE_OPTIONS: "--use-openssl-ca" },
      timeout_sec: PROCESS_TIMEOUT_SECONDS,
    });
    if ((install.exit_code ?? 0) !== 0) {
      const stderr = Buffer.from(install.stderr_b64 ?? "", "base64").toString();
      throw new Error(`npm install failed (exit ${install.exit_code}): ${stderr}`);
    }

    const config = { apiKey: AI_GATEWAY_API_KEY, model: FX_MODEL, task: FX_TASK };
    const code = `const config = ${JSON.stringify(config)};\n${AGENT_SCRIPT}`;

    const result = await kernel.browsers.repl(browser.session_id, {
      code,
      timeout_sec: REPL_TIMEOUT_SECONDS,
    });

    if (!result.success) {
      throw new Error(`repl execution failed: ${result.error}\n${result.stack ?? ""}`);
    }

    const write = result.content?.find(
      (item) => item.type === "text" && item.channel === "write",
    );
    if (!write || write.type !== "text") throw new Error("agent produced no output");

    const { text } = JSON.parse(write.text) as { text: string };
    console.log(text);
  } finally {
    await kernel.browsers.deleteByID(browser.session_id).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
