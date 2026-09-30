import { openai } from "@ai-sdk/openai";
import { kernel } from "@e2e-dev/kernel";
import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";

export default {
  targets: [
    {
      name: "docs",
      engine: web({
        viewport: null,
        browser: kernel({
          stealth: true,
          viewport: { width: 1920, height: 1080 },
        }),
      }),
      app: { url: process.env.DOCS_URL ?? "https://www.kernel.sh" },
      video: "retain-on-failure",
    },
  ],
  agents: {
    default: { model: openai("gpt-6-luna") },
  },
} satisfies E2EConfig;
