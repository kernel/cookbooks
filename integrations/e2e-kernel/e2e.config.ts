import { openai } from "@ai-sdk/openai";
import { web } from "@e2edev/web";
import type { E2EConfig } from "e2e";
import { createAgent } from "e2e/agent";
import { kernel } from "@testerarmy/e2e/kernel";

export default {
  targets: [
    {
      name: "docs",
      engine: web({
        url: process.env.DOCS_URL ?? "https://www.kernel.sh",
        viewport: { width: 1920, height: 1080 },
        browser: kernel({
          stealth: true,
          viewport: { width: 1920, height: 1080 },
        }),
      }),
    },
  ],
  agents: {
    default: createAgent({ model: openai("gpt-6-luna") }),
  },
} satisfies E2EConfig;
