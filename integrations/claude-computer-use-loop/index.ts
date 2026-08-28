#!/usr/bin/env node

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import Kernel from "@onkernel/sdk";
import { Buffer } from "buffer";

// With the GA computer_toolset_20260801 toolset, each action is its own member tool:
// the model emits tool_use blocks named e.g. "left_click", "type", "screenshot" with
// toolset_name "computer". We fold the member name into `action` for dispatch.
interface ComputerUseAction {
  action: string; // member tool name, e.g. "left_click", "mouse_move", "screenshot", "key", "scroll"
  coordinate?: [number, number]; // [x, y] for mouse actions (screenshot pixel space)
  start_coordinate?: [number, number]; // for left_click_drag
  text?: string; // typed text, or key name/combination for "key"
  keys?: string[]; // legacy fallback for key presses
  delta_x?: number; // For scroll actions (legacy format)
  delta_y?: number; // For scroll actions (legacy format)
  scroll_direction?: string; // For scroll actions: 'up', 'down', 'left', 'right'
  scroll_amount?: number; // For scroll actions: number of scroll units
}

class ComputerUseLoop {
  private anthropic: Anthropic;
  private kernel: Kernel;
  private browserSessionId?: string;
  private maxIterations: number = 50;

  constructor(anthropicApiKey: string, kernelApiKey?: string) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
    this.kernel = new Kernel({ apiKey: kernelApiKey });
  }

  async start(taskPrompt: string): Promise<void> {
    console.log(`Starting Computer Use loop with task: "${taskPrompt}"`);

    // Create a Kernel browser
    console.log("Creating Kernel browser...");
    const kernelBrowser = await this.kernel.browsers.create({
      headless: false,
      stealth: true,
    });
    this.browserSessionId = kernelBrowser.session_id;
    console.log(`Browser created with session ID: ${this.browserSessionId}`);
    console.log(`Live view: ${kernelBrowser.browser_live_view_url}`);

    try {
      let iteration = 0;
      let completed = false;

      // Maintain conversation history across iterations
      const messages: Array<{
        role: "user" | "assistant";
        content: Array<any>;
      }> = [];

      // Initial screenshot
      const initialScreenshot = await this.captureScreenshot();
      messages.push({
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: initialScreenshot,
            },
          },
          {
            type: "text",
            text: taskPrompt,
          },
        ],
      });

      while (!completed && iteration < this.maxIterations) {
        iteration++;
        console.log(`\n--- Iteration ${iteration} ---`);

        // Send to Anthropic with conversation history
        const messageResponse = await this.requestActionsWithHistory(messages);

        // Add assistant response to history
        messages.push({
          role: "assistant",
          content: messageResponse.content,
        });

        // Extract computer-toolset member calls from the response. Each member call is a
        // tool_use block named after the action (left_click, type, screenshot, ...) and
        // tagged with toolset_name "computer".
        const toolUses = messageResponse.content.filter(
          (c: any) => c.type === "tool_use" && c.toolset_name === "computer",
        );

        if (toolUses.length === 0) {
          console.log("No tool uses returned. Task may be complete.");
          completed = true;
          break;
        }

        // Execute actions and send tool results back
        const toolResults: Array<any> = [];

        let returnedScreenshot = false;
        for (const toolUse of toolUses) {
          const input =
            typeof toolUse.input === "string"
              ? JSON.parse(toolUse.input)
              : toolUse.input;
          // Member tool_use blocks carry the action as the tool name; fold it in for dispatch.
          const action = { action: toolUse.name, ...input } as ComputerUseAction;

          // Screenshot member calls must be answered with an image in the tool_result itself
          if (action.action === "screenshot") {
            const screenshot = await this.captureScreenshot();
            returnedScreenshot = true;
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              toolset_name: "computer",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/png",
                    data: screenshot,
                  },
                },
              ],
            });
            continue;
          }

          // Execute the action
          try {
            await this.executeAction(action);
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              toolset_name: "computer",
              content: `Successfully executed ${action.action} action.`,
            });
          } catch (error) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              toolset_name: "computer",
              content: `Error executing ${action.action}: ${error}`,
              is_error: true,
            });
          }
        }

        // Add tool results to conversation
        if (toolResults.length > 0) {
          const content: Array<any> = [...toolResults];
          // If no screenshot member call already returned one, append a fresh screenshot
          // so the model always sees the page state after its actions.
          if (!returnedScreenshot) {
            const newScreenshot = await this.captureScreenshot();
            content.push({
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: newScreenshot,
              },
            });
          }
          messages.push({
            role: "user",
            content,
          });
        } else {
          // No non-screenshot actions, just continue
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
      }

      if (iteration >= this.maxIterations) {
        console.log(
          `\nReached maximum iterations (${this.maxIterations}). Stopping.`,
        );
      }
    } catch (error) {
      console.error("Error during execution:", error);
      throw error;
    } finally {
      if (this.browserSessionId) {
        console.log("\nCleaning up browser...");
        await this.kernel.browsers.deleteByID(this.browserSessionId);
      }
    }
  }

  private async captureScreenshot(): Promise<string> {
    if (!this.browserSessionId) {
      throw new Error("Browser session not initialized");
    }

    console.log("Capturing screenshot...");
    const response = await this.kernel.browsers.computer.captureScreenshot(
      this.browserSessionId,
    );

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    console.log(`Screenshot captured (${buffer.length} bytes)`);
    return base64;
  }

  private async requestActionsWithHistory(
    messages: Array<{ role: "user" | "assistant"; content: Array<any> }>,
  ): Promise<any> {
    console.log("Sending message to Claude with Computer Use tool...");

    // computer_toolset_20260801 is GA on Sonnet 5 / Opus 5 - no beta header, no
    // display_*_px (coordinates are in the pixel space of the screenshots we return).
    const message = await this.anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      tools: [
        {
          type: "computer_toolset_20260801",
        },
      ],
      messages: messages as any,
    });

    // Log the full response to see the schema
    return message;
  }

  private async executeAction(action: ComputerUseAction): Promise<void> {
    if (!this.browserSessionId) {
      throw new Error("Browser session not initialized");
    }

    console.log(`Executing action: ${action.action}`, action);

    try {
      const rawCoords = action.coordinate || [];
      const [x, y] = [rawCoords[0], rawCoords[1]];

      switch (action.action) {
        case "left_click":
          if (x !== undefined && y !== undefined) {
            console.log(
              `Calling Kernel clickMouse with session_id: ${this.browserSessionId}, x: ${x}, y: ${y}`,
            );
            try {
              await this.kernel.browsers.computer.clickMouse(
                this.browserSessionId,
                {
                  x,
                  y,
                  button: "left",
                },
              );
              console.log("Kernel clickMouse completed successfully");
              // Add a small delay after clicking to allow the action to register
              await new Promise((resolve) => setTimeout(resolve, 300));
            } catch (error) {
              console.error("Kernel clickMouse error:", error);
              throw error;
            }
          } else {
            console.warn("Left click action missing coordinates");
          }
          break;

        case "triple_click":
          if (x !== undefined && y !== undefined) {
            console.log(
              `Calling Kernel triple click with session_id: ${this.browserSessionId}, x: ${x}, y: ${y}`,
            );
            try {
              await this.kernel.browsers.computer.clickMouse(
                this.browserSessionId,
                {
                  x,
                  y,
                  button: "left",
                  num_clicks: 3,
                },
              );
              console.log("Kernel triple click completed successfully");
              await new Promise((resolve) => setTimeout(resolve, 300));
            } catch (error) {
              console.error("Kernel triple click error:", error);
              throw error;
            }
          } else {
            console.warn("Triple click action missing coordinates");
          }
          break;

        case "right_click":
          if (x !== undefined && y !== undefined) {
            await this.kernel.browsers.computer.clickMouse(
              this.browserSessionId,
              {
                x,
                y,
                button: "right",
              },
            );
          } else {
            console.warn("Right click action missing coordinates");
          }
          break;

        case "mouse_move":
          if (x !== undefined && y !== undefined) {
            await this.kernel.browsers.computer.moveMouse(
              this.browserSessionId,
              {
                x,
                y,
              },
            );
          } else {
            console.warn("Mouse move action missing coordinates");
          }
          break;

        case "wait":
          const duration = (action as any).duration || 1; // Default to 1 second
          console.log(`Waiting ${duration} second(s)...`);
          await new Promise((resolve) => setTimeout(resolve, duration * 1000));
          break;

        case "screenshot":
          // Take a fresh screenshot when requested by Claude
          console.log("Screenshot action requested - taking fresh screenshot");
          // Note: The screenshot will be captured in the next iteration, so we just acknowledge here
          // or we could capture it now and store it for the next iteration, but for simplicity
          // we'll just let the loop handle it
          break;

        case "key":
        case "key_press":
        case "keydown":
        case "keyup":
          if (action.text) {
            // Parse key combinations like 'ctrl+l', 'return', 'escape'
            const keyCombination = this.parseKeyCombination(action.text);
            console.log(
              `Calling Kernel pressKey with session_id: ${this.browserSessionId}, keys: ${JSON.stringify(keyCombination)}`,
            );
            try {
              await this.kernel.browsers.computer.pressKey(
                this.browserSessionId,
                {
                  keys: keyCombination,
                },
              );
              console.log(
                `Successfully pressed key combination: ${action.text} -> ${JSON.stringify(keyCombination)}`,
              );
            } catch (error) {
              console.error("Kernel pressKey error:", error);
              throw error;
            }
          } else if (action.keys && action.keys.length > 0) {
            console.log(
              `Calling Kernel pressKey with session_id: ${this.browserSessionId}, keys: ${JSON.stringify(action.keys)}`,
            );
            try {
              await this.kernel.browsers.computer.pressKey(
                this.browserSessionId,
                {
                  keys: action.keys,
                },
              );
              console.log("Kernel pressKey completed successfully");
            } catch (error) {
              console.error("Kernel pressKey error:", error);
              throw error;
            }
          } else {
            console.warn("Key action missing keys or text");
          }
          break;

        case "type":
        case "typing":
          if (action.text) {
            await this.kernel.browsers.computer.typeText(
              this.browserSessionId,
              {
                text: action.text,
                delay: 550,
              },
            );
          } else {
            console.warn("Type action missing text");
          }
          break;

        case "scroll":
          if (x !== undefined && y !== undefined) {
            let delta_x = 0;
            let delta_y = 0;

            // Handle new format: scroll_direction and scroll_amount
            if (action.scroll_direction && action.scroll_amount !== undefined) {
              const amount = action.scroll_amount || 3; // Default to 3 if not specified
              const direction = action.scroll_direction.toLowerCase();

              switch (direction) {
                case "up":
                  delta_y = -amount * 120; // Negative for up, 120 is typical scroll unit
                  break;
                case "down":
                  delta_y = amount * 120; // Positive for down
                  break;
                case "left":
                  delta_x = -amount * 120; // Negative for left
                  break;
                case "right":
                  delta_x = amount * 120; // Positive for right
                  break;
                default:
                  console.warn(`Unknown scroll direction: ${direction}`);
              }
            } else if (
              action.delta_x !== undefined ||
              action.delta_y !== undefined
            ) {
              // Handle legacy format with delta_x and delta_y
              delta_x = action.delta_x || 0;
              delta_y = action.delta_y || 0;
            } else {
              console.warn(
                "Scroll action missing scroll_direction/scroll_amount or delta_x/delta_y",
              );
              break;
            }

            console.log(
              `Calling Kernel scroll with session_id: ${this.browserSessionId}, x: ${x}, y: ${y}, delta_x: ${delta_x}, delta_y: ${delta_y}`,
            );
            try {
              await this.kernel.browsers.computer.scroll(
                this.browserSessionId,
                {
                  x,
                  y,
                  delta_x,
                  delta_y,
                },
              );
              console.log("Kernel scroll completed successfully");
            } catch (error) {
              console.error("Kernel scroll error:", error);
              throw error;
            }
          } else {
            console.warn("Scroll action missing coordinates");
          }
          break;

        case "left_click_drag":
          if (
            action.start_coordinate &&
            action.start_coordinate.length >= 2 &&
            action.coordinate &&
            action.coordinate.length >= 2
          ) {
            // start_coordinate -> coordinate; Kernel exposes press/drag via move + click,
            // full drag support would need additional implementation
            console.warn("left_click_drag action needs additional implementation");
          } else {
            console.warn("left_click_drag action missing start or end coordinate");
          }
          break;

        default:
          console.warn(`Unknown action type: ${action.action}`);
      }
    } catch (error) {
      console.error(`Error executing action ${action.action}:`, error);
      throw error;
    }
  }

  private parseKeyCombination(text: string): string[] {
    // Map common key names to X11 keysym format (used by Kernel)
    const keyMap: Record<string, string> = {
      return: "Return", // Main keyboard Enter
      enter: "Return", // Map enter to Return (main keyboard)
      escape: "Escape",
      esc: "Escape",
      ctrl: "Control", // X11 keysym uses "Control" not "Ctrl"
      control: "Control",
      shift: "Shift",
      alt: "Alt",
      meta: "Meta",
      super: "Super", // X11 keysym for Windows/Super key
      cmd: "Meta", // macOS Command maps to Meta
      command: "Meta",
      tab: "Tab",
      space: "space", // X11 uses lowercase for space
      backspace: "BackSpace", // X11 keysym uses "BackSpace"
      delete: "Delete",
      up: "Up", // X11 uses "Up", "Down", "Left", "Right"
      down: "Down",
      left: "Left",
      right: "Right",
      home: "Home",
      end: "End",
      pageup: "Prior", // X11 uses "Prior" for Page Up
      pagedown: "Next", // X11 uses "Next" for Page Down
      insert: "Insert",
      f1: "F1",
      f2: "F2",
      f3: "F3",
      f4: "F4",
      f5: "F5",
      f6: "F6",
      f7: "F7",
      f8: "F8",
      f9: "F9",
      f10: "F10",
      f11: "F11",
      f12: "F12",
    };

    // Convert to lowercase for matching
    const lowerText = text.toLowerCase().trim();

    // Handle special cases
    if (lowerText === "return" || lowerText === "enter") {
      return ["Return"];
    }
    if (lowerText === "escape" || lowerText === "esc") {
      return ["Escape"];
    }

    // Handle key combinations like 'ctrl+l', 'ctrl+shift+t', etc.
    if (lowerText.includes("+")) {
      const parts = lowerText.split("+").map((p) => p.trim());
      const mapped = parts.map((part) => {
        // Map modifiers and special keys
        if (keyMap[part]) {
          return keyMap[part];
        }
        // Single character keys - return uppercase
        if (part.length === 1) {
          return part.toUpperCase();
        }
        // For other keys, try to capitalize appropriately
        return part.charAt(0).toUpperCase() + part.slice(1);
      });
      // Join with + for X11 keysym format
      return [mapped.join("+")];
    }

    // Single key - try to map or return as-is
    if (keyMap[lowerText]) {
      return [keyMap[lowerText]];
    }

    // If it's a single character, return it uppercase (but lowercase for space)
    if (text.length === 1) {
      return [text === " " ? "space" : text.toUpperCase()];
    }

    // Default: return as-is with proper capitalization for X11 keysym
    return [text.charAt(0).toUpperCase() + text.slice(1)];
  }
}

// Main entry point
async function main() {
  const prompt = process.argv[2];

  if (!prompt) {
    console.error('Usage: npx tsx index.ts "<prompt>"');
    console.error(
      'Example: npx tsx index.ts "Navigate to google.com and search for TypeScript"',
    );
    process.exit(1);
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const kernelApiKey = process.env.KERNEL_API_KEY;

  if (!anthropicApiKey) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is required");
    process.exit(1);
  }

  if (!kernelApiKey) {
    console.warn(
      "Warning: KERNEL_API_KEY not set, using default (if configured)",
    );
  }

  const loop = new ComputerUseLoop(anthropicApiKey, kernelApiKey);

  try {
    await loop.start(prompt);
    console.log("\n✅ Computer Use loop completed successfully");
  } catch (error) {
    console.error("\n❌ Computer Use loop failed:", error);
    process.exit(1);
  }
}

main();
