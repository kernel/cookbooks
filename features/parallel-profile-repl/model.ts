import { anthropic } from "@ai-sdk/anthropic";
import { gateway } from "ai";

export function selectModel(env = process.env) {
  const route = env.MODEL_ROUTE ?? (env.ANTHROPIC_API_KEY ? "anthropic" : "gateway");
  if (route === "anthropic" && env.ANTHROPIC_API_KEY) {
    return { route, model: anthropic("claude-sonnet-5-5") };
  }
  if (route === "gateway" && env.AI_GATEWAY_API_KEY) {
    return { route, model: gateway("anthropic/claude-sonnet-5.5") };
  }
  throw new Error("Set ANTHROPIC_API_KEY or AI_GATEWAY_API_KEY; MODEL_ROUTE must be anthropic or gateway. No model fallback is used.");
}
