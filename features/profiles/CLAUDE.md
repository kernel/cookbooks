# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Kernel TypeScript application that demonstrates profile-based browser automation using the Kernel SDK and Magnitude framework. The application manages browser profiles for authentication persistence and task automation.

## Commands

```bash
# Install dependencies
pnpm install

# Run the application
pnpm dlx tsx index.ts

# Invoke Kernel actions via CLI
kernel invoke profile-auth-and-task-execution create-profile-browser
kernel invoke profile-auth-and-task-execution end-session-and-save-profile --payload '{"session_id": "1234567890"}'
kernel invoke profile-auth-and-task-execution execute-task-with-profile --payload '{"profile_name": "profile_123456_abc", "task": "Go to ign.com and say the latest news stories", "extract_instructions": "Extract headlines and article summaries"}'
kernel invoke profile-auth-and-task-execution get-payload-schemas
```

## Architecture

The application implements a profile-based browser automation system with four main actions:

1. **create-profile-browser**: Creates a new browser instance with a persistent profile for authentication. The profile is saved when the session ends (via `save_changes: true`)
2. **end-session-and-save-profile**: Terminates a browser session. If the session was generating a new profile, it will be saved
3. **execute-task-with-profile**: Executes automated tasks using an existing profile with pre-loaded authentication (uses `save_changes: false` to avoid modifying the existing profile). Supports optional data extraction after task completion using AI
4. **get-payload-schemas**: Returns the expected payload format for each action, helping LLMs understand the API structure and requirements

Key architectural components:

- **Kernel SDK** (`@onkernel/sdk`): Manages browser instances, profiles, and invocations
- **Magnitude Core** (`magnitude-core`): Provides browser automation capabilities with LLM integration and data extraction using Zod schemas
- **Profile System**: Enables persistent authentication across browser sessions using named profiles with `save_changes` flag
- **Browser Cleanup**: Sessions are properly terminated with `kernel.browsers.deleteByID()` and agents are stopped with `agent.stop()`

The application requires an `ANTHROPIC_API_KEY` environment variable for the LLM-powered browser automation.

## TypeScript Configuration

- Target: ESNext with bundler module resolution
- Strict mode enabled
- `.ts` and `.tsx` files in all directories except `node_modules` and `dist`
