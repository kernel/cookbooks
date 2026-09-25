import { openai } from "@ai-sdk/openai";
import { web } from "@e2edev/web";
import type { E2EConfig } from "e2e";
import { createAgent } from "e2e/agent";
import { kernel } from "@testerarmy/e2e/kernel";

export default {
  targets: [
    {
      name: "kernel-docs",
      engine: web({
        url: process.env.DOCS_URL ?? "https://www.kernel.sh",
        browser: kernel({ stealth: true }),
      }),
    },
  ],
  agents: {
    default: createAgent({ model: openai("gpt-6-luna") }),
  },
} satisfies E2EConfig;
