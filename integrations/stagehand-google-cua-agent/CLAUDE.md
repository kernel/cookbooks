# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Kernel application that integrates Google's Gemini 2.5 Computer Use model with Stagehand for browser automation. The application demonstrates Computer Use Agent (CUA) capabilities through web automation tasks.

## Architecture

### Core Components

**Kernel Integration** (`index.ts`)

- Uses `@onkernel/sdk` to create a Kernel app with action handlers
- Manages remote browser instances through `kernel.browsers.create()`
- Supports both action handler execution (with `invocation_id`) and local execution (without `invocation_id`)

**Dual Execution Modes**

- **Action Handler Mode**: Executed via Kernel's action invocation system, receives `ctx.invocation_id` to associate browser with the action
- **Local Mode**: Direct script execution using `import.meta.url === \`file://${process.argv[1]}\`` check (ES modules), creates browser without invocation association
- The `runStagehandTask(invocationId?: string)` function handles both modes by conditionally passing `invocation_id` to browser creation

**Browser Automation Flow**

1. Create Kernel browser (with or without invocation_id based on execution mode)
2. Initialize Stagehand with CDP URL from Kernel browser
3. Configure Gemini agent with computer use capabilities
4. Execute browser automation tasks through Stagehand's agent interface

**Stagehand Configuration**

- Runs in "LOCAL" env mode but connects to remote Kernel browser via CDP
- Uses `localBrowserLaunchOptions.cdpUrl` to connect to `kernel.browsers.create()` CDP endpoint
- Configured with 30-second DOM settle timeout for dynamic content
- Uses GPT-4o for Stagehand operations and Gemini 2.5 for computer use agent tasks

## Environment Variables

Required API keys (stored in `.env` file):

- `KERNEL_API_KEY`: Kernel platform authentication
- `GOOGLE_API_KEY`: Gemini 2.5 Computer Use model access
- `OPENAI_API_KEY`: Stagehand's GPT-4o model access

**Setup**: Copy `.env-example` to `.env` and populate all three keys.

## Key Patterns

### Browser Lifecycle

- Kernel manages the browser instance lifecycle
- Browser CDP WebSocket URL is passed to Stagehand for control
- Live view URL available at `kernelBrowser.browser_live_view_url`

### Error Handling

- All Stagehand operations wrapped in try/catch
- Returns `SearchQueryOutput` with success status and result message
- Always closes Stagehand on both success and error paths

### Execution Detection

- Uses `import.meta.url === \`file://${process.argv[1]}\`` to detect direct execution (ES modules)
- Automatically runs `runStagehandTask()` when executed locally
- Registers action handler when imported as module

## Execution Commands

**Setup**:

```bash
cp .env-example .env
# Edit .env to add KERNEL_API_KEY, GOOGLE_API_KEY, OPENAI_API_KEY
```

**Local Development**:

```bash
npx tsx index.ts  # Runs without invocation_id
```

**Deploy to Kernel**:

```bash
kernel deploy index.ts --env-file .env
```

**Invoke via Kernel CLI**:

```bash
kernel invoke ts-stagehand-google-cua-agent google-cua-agent-task
```

## Documentation

- Kernel docs: https://docs.onkernel.com/quickstart
- Kernel app secrets / env vars: https://www.kernel.sh/docs/apps/secrets
- Stagehand SDK: https://github.com/browserbase/stagehand
