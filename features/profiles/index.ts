import { Kernel, type KernelContext, ConflictError } from "@onkernel/sdk";
import { startBrowserAgent } from "magnitude-core";
import { z } from "zod";

const kernel = new Kernel();

const app = kernel.app("profile-auth-and-task-execution");

/**
 * Action that instantiates a Profile driven Kernel browser that can be reused across browser sessions
 * Invoke this action to test Kernel browsers manually with our browser live view
 * Use the Profile browser to log into your account on a website
 * Use the Profile to create a task that can be executed in a new browser with the same Profile pre-loaded
 * https://www.kernel.sh/docs/auth/profiles
 * Args:
 *     ctx: Kernel context containing invocation information
 * Returns:
 *     A dictionary containing the Profile-ready browser live view url for the human to complete authentication on
 * Invoke this via CLI:
 *  kernel invoke profile-auth-and-task-execution create-profile-browser
 */
interface CreateProfileBrowserOutput {
  browser_live_view_url: string;
  profile_name: string;
  session_id: string;
}

app.action(
  "create-profile-browser",
  async (ctx: KernelContext): Promise<CreateProfileBrowserOutput> => {
    // Generate a non-CUID profile name using timestamp and random string
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const profileName = `profile_${timestamp}_${randomStr}`;
    try {
      const profile = await kernel.profiles.create({
        name: profileName,
      });
      console.log("Profile created", profile);
    } catch (error) {
      if (error instanceof ConflictError) {
        console.log("Profile already exists");
      } else {
        throw error;
      }
    }

    // Create a new browser with the profile
    const kernelBrowser = await kernel.browsers.create({
      invocation_id: ctx.invocation_id,
      profile: {
        name: profileName,
        save_changes: true, // This will save the profile to the database once the session ends
      },
      stealth: true, // Turns on residential proxy & auto-CAPTCHA solver
    });
    console.log("Browser created", kernelBrowser);
    return {
      browser_live_view_url: kernelBrowser.browser_live_view_url || "",
      profile_name: profileName,
      session_id: kernelBrowser.session_id || "",
    };
  },
);

/**
 * This action will accept a session ID and end the browser session. If the session was generating a new Profile, it will be saved.
 * Args:
 *     ctx: Kernel context containing invocation information
 * Returns:
 *     returns a boolean indicating if the session was ended successfully
 * Invoke this via CLI:
 *  kernel invoke profile-auth-and-task-execution end-session-and-save-profile --payload '{"session_id": "1234567890"}'
 *
 */

interface EndSessionAndSaveProfilePayload {
  session_id: string;
}

interface EndSessionAndSaveProfileOutput {
  success: boolean;
}

app.action(
  "end-session-and-save-profile",
  async (
    ctx: KernelContext,
    payload?: EndSessionAndSaveProfilePayload,
  ): Promise<EndSessionAndSaveProfileOutput> => {
    if (!payload || !payload.session_id) {
      return {
        success: false,
      };
    }
    const { session_id } = payload;
    try {
      await kernel.browsers.deleteByID(session_id);
      console.log("Browser session deleted and profile saved.");
    } catch (error) {
      console.error("Error deleting browser", error);
      return {
        success: false,
      };
    }
    return {
      success: true,
    };
  },
);
/**
 * This action will use the Profile browser and execute a task on a new browser with the same Profile pre-loaded
 * Args:
 *     ctx: Kernel context containing invocation information
 * Returns:
 *     A dictionary containing the task execution result
 * Invoke this via CLI:
 *  kernel invoke auth-and-task execute-task-with-profile --payload '{"task": "Go to ign.com and say the latest news stories"}'
 *
 */

interface ExecuteTaskWithProfilePayload {
  profile_name: string;
  task: string;
  url?: string;
  extract_instructions?: string; // Optional: Instructions for extracting data after task completion
}

interface ExecuteTaskWithProfileOutput {
  success: boolean;
  task_result?: any;
  extracted_data?: Record<string, any>; // Optional: Structured data extracted after task completion
  error?: string;
  session_id?: string;
}

app.action(
  "execute-task-with-profile",
  async (
    ctx: KernelContext,
    payload?: ExecuteTaskWithProfilePayload,
  ): Promise<ExecuteTaskWithProfileOutput> => {
    if (!payload) {
      return {
        success: false,
        error: "Payload is required with profile_name and task",
      };
    }

    const { profile_name, task, url, extract_instructions } = payload;

    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        success: false,
        error: "ANTHROPIC_API_KEY environment variable is not set",
      };
    }

    let kernelBrowser;
    let agent;

    try {
      // Create a new browser with the existing profile (no save_changes)
      kernelBrowser = await kernel.browsers.create({
        invocation_id: ctx.invocation_id,
        profile: {
          name: profile_name,
          save_changes: false, // This will not save additional changes to the profile.
        },
        stealth: true, // Turns on residential proxy & auto-CAPTCHA solver
      });

      console.log("Browser created with profile:", profile_name);

      // Configure LLM
      const llmConfig = {
        provider: "anthropic" as const,
        options: {
          // Note: magnitude-core always sends `temperature`, which claude-sonnet-5
          // and newer models reject (400 "`temperature` is deprecated for this model").
          // claude-sonnet-4-6 is the newest model that still accepts sampling params.
          model: "claude-sonnet-4-6",
          apiKey: process.env.ANTHROPIC_API_KEY,
        },
      };

      // Start browser agent with Magnitude
      agent = await startBrowserAgent({
        url: url || "",
        narrate: true, // Set to true for debugging
        llm: llmConfig,
        virtualScreenDimensions: {
          width: 1024,
          height: 768,
        },
        browser: {
          cdp: kernelBrowser.cdp_ws_url,
          contextOptions: {
            viewport: {
              width: 1024,
              height: 768,
            },
          },
        },
      });

      console.log("Browser agent started, executing task:", task);

      // Execute the task
      const result = await agent.act(task);

      // Extract data after task is completed if instructions are provided
      let extractedData = null;
      if (extract_instructions) {
        try {
          console.log(
            "Extracting data with instructions:",
            extract_instructions,
          );

          // Define a flexible schema that can accommodate various data types
          const flexibleSchema = z.object({
            data: z.record(z.any()), // Allows any key-value pairs
          });

          // Extract data using the provided instructions
          extractedData = await agent.extract(
            extract_instructions,
            flexibleSchema,
          );
          console.log("Data extracted successfully");
        } catch (extractError) {
          console.error("Error extracting data:", extractError);
          // Continue without extraction data rather than failing the entire operation
        }
      }

      return {
        success: true,
        task_result: result,
        extracted_data: extractedData ?? undefined,
        session_id: kernelBrowser.session_id,
      };
    } catch (error) {
      console.error("Error executing task:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        session_id: kernelBrowser?.session_id,
      };
    } finally {
      // Clean up browser session
      if (kernelBrowser?.session_id) {
        try {
          await kernel.browsers.deleteByID(kernelBrowser.session_id); // Delete the browser session
          console.log("Browser session cleaned up");
          if (agent) {
            agent.stop(); // Stop the browser agent
            console.log("Browser agent stopped");
          }
        } catch (cleanupError) {
          console.error(
            "Error cleaning up browser session and stopping agent:",
            cleanupError,
          );
        }
      }
    }
  },
);

/**
 * Helper action that returns the expected payload format for each action
 * This helps LLMs understand what parameters are required for each action
 * Invoke this via CLI:
 *  kernel invoke profile-auth-and-task-execution get-payload-schemas
 */

interface PayloadField {
  type: string;
  required: boolean;
  description: string;
}

interface ActionSchema {
  description: string;
  payload: Record<string, PayloadField> | null;
}

interface GetPayloadSchemasOutput {
  [actionName: string]: ActionSchema;
}

app.action(
  "get-payload-schemas",
  async (ctx: KernelContext): Promise<GetPayloadSchemasOutput> => {
    return {
      "create-profile-browser": {
        description:
          "Creates a new browser with a persistent profile for authentication",
        payload: null, // No payload required
      },
      "end-session-and-save-profile": {
        description: "Ends a browser session and saves the profile state",
        payload: {
          session_id: {
            type: "string",
            required: true,
            description: "The browser session ID to terminate",
          },
        },
      },
      "execute-task-with-profile": {
        description:
          "Executes automated tasks using an existing profile with pre-loaded authentication",
        payload: {
          profile_name: {
            type: "string",
            required: true,
            description:
              "The profile name to use (from create-profile-browser)",
          },
          task: {
            type: "string",
            required: true,
            description: "Natural language description of the task to execute",
          },
          url: {
            type: "string",
            required: false,
            description: "Optional starting URL for the browser",
          },
          extract_instructions: {
            type: "string",
            required: false,
            description:
              "Optional instructions for extracting structured data after task completion",
          },
        },
      },
      "get-payload-schemas": {
        description: "Returns the expected payload format for each action",
        payload: null, // No payload required
      },
    };
  },
);
