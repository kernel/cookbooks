import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import client, { Kernel, type KernelContext } from "@onkernel/sdk";
import { z } from "zod";

const kernel = new Kernel({
  apiKey: process.env.KERNEL_API_KEY,
});

const app = kernel.app("ts-stagehand-google-cua-agent");

interface SearchQueryOutput {
  success: boolean;
  result: string;
}

// API Keys for LLM providers
// - GOOGLE_API_KEY: Required for the Gemini Computer Use Agent
// - OPENAI_API_KEY: Required for Stagehand's default model
// Set via environment variables or `kernel deploy <filename> --env-file .env`
// See https://www.kernel.sh/docs/apps/secrets
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set");
}

if (!GOOGLE_API_KEY) {
  throw new Error("GOOGLE_API_KEY is not set");
}

async function runStagehandTask(
  invocationId?: string,
): Promise<SearchQueryOutput> {
  // Executes a Computer Use Agent (CUA) task using Gemini 2.5 and Stagehand
  //
  // This function supports dual execution modes:
  // - Action Handler Mode: Called with invocation_id from Kernel app action context
  // - Local Mode: Called without invocation_id for direct script execution
  //
  // Args:
  //     invocationId: Optional Kernel invocation ID to associate browser with action
  //
  // App Actions Returns:
  //     SearchQueryOutput: Success status and result message from the agent
  // Local Execution Returns:
  //     Logs the result of the agent execution

  // timeout_seconds keeps the Kernel browser alive for the full agent run;
  // without it the browser defaults to a 60s inactivity timeout and can be
  // reclaimed mid-task ("Stagehand session was closed" / 404 browser not found).
  const browserOptions = invocationId
    ? { invocation_id: invocationId, stealth: true, timeout_seconds: 600 }
    : { stealth: true, timeout_seconds: 600 };

  const kernelBrowser = await kernel.browsers.create(browserOptions);

  console.log(
    "Kernel browser live view url: ",
    kernelBrowser.browser_live_view_url,
  );

  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    domSettleTimeout: 30_000,
    model: {
      modelName: "openai/gpt-5.6-luna",
      apiKey: OPENAI_API_KEY,
    },
    localBrowserLaunchOptions: {
      cdpUrl: kernelBrowser.cdp_ws_url,
    },
  });
  await stagehand.init();

  /////////////////////////////////////
  // Your Stagehand implementation here
  /////////////////////////////////////
  try {
    const page =
      stagehand.context.activePage() ?? (await stagehand.context.newPage());

    const agent = stagehand.agent({
      mode: "cua",
      model: {
        modelName: "google/gemini-3.5-flash",
        apiKey: GOOGLE_API_KEY,
      },
      systemPrompt: `You are a helpful assistant that can use a web browser.
      You are currently on the following page: ${page.url()}.
      Do not ask follow up questions, the user will trust your judgement.`,
    });

    // Navigate to YCombinator's website
    await page.goto("https://www.ycombinator.com/companies");

    // Define the instructions for the CUA agent
    const instruction =
      "Find Kernel's company page on the YCombinator website and write a blog post about their product offering.";

    // Execute the instruction
    const result = await agent.execute({
      instruction,
      maxSteps: 20,
    });

    console.log("result: ", result);

    // Stagehand's core primitives — act() and extract() — run on the main
    // model (gpt-5.6-luna) rather than the Gemini CUA agent. act() performs a
    // single described action; extract() pulls structured data with a zod schema.
    await page.goto("https://news.ycombinator.com");
    await stagehand.act("Click the 'new' link in the top navigation bar");
    const { stories } = await stagehand.extract(
      "Extract the rank and title of the first 3 stories on the page",
      z.object({
        stories: z.array(z.object({ rank: z.number(), title: z.string() })),
      }),
    );
    console.log("Extracted stories: ", stories);

    console.log("Deleting browser and closing stagehand...");
    await stagehand.close();
    await kernel.browsers.deleteByID(kernelBrowser.session_id);
    return { success: true, result: result.message };
  } catch (error) {
    console.error(error);
    console.log("Deleting browser and closing stagehand...");
    await stagehand.close();
    await kernel.browsers.deleteByID(kernelBrowser.session_id);
    return { success: false, result: "" };
  }
}

// Register Kernel action handler for remote invocation
// Invoked via: kernel invoke ts-stagehand-google-cua-agent google-cua-agent-task
app.action<void, SearchQueryOutput>(
  "google-cua-agent-task",
  async (ctx: KernelContext): Promise<SearchQueryOutput> => {
    return runStagehandTask(ctx.invocation_id);
  },
);

// Run locally if executed directly (not imported as a module)
// Execute via: npx tsx index.ts
// The deployed Kernel runtime also executes this bundle directly, so check
// for Kernel's injected KERNEL_INVOCATION marker to avoid running the task
// (and exiting the process) at app boot, which would break action handling.
if (
  !process.env.KERNEL_INVOCATION &&
  import.meta.url === `file://${process.argv[1]}`
) {
  runStagehandTask()
    .then((result) => {
      console.log("Local execution result:", result);
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Local execution failed:", error);
      process.exit(1);
    });
}
