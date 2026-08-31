# BU-1.0-model-python

A Kernel application that implements the Browser Use SDK with the `BU 1.0` model for autonomous browser automation tasks.

## Description

This application provides a dual-mode Browser Use agent that can run both locally and as a deployed Kernel action. It leverages the Browser Use framework and bu-1.0 model to perform autonomous web browsing tasks on Kernel-hosted browsers.

## Prerequisites

- Python 3.11 or higher
- Kernel CLI (for deployment)
- Kernel API Key
- Browser Use API key on a paid plan (Dev or higher). The `ChatBrowserUse` LLM Gateway rejects free-tier accounts with HTTP 403, even with a credit balance. Free-tier users can run bu models through Browser Use's hosted [Cloud Agent API](https://docs.browser-use.com/cloud/agent/quickstart) instead, which is a different execution path than this cookbook.

## Installation

1. Install dependencies using uv:

```bash
uv sync
```

2. Set up your environment variables in `.env`:

```
BROWSER_USE_API_KEY=your_api_key_here
KERNEL_API_KEY=your_api_key_here
```

## Usage

### Local Execution

Run the agent locally with a task:

```bash
uv run main.py "Give me a 1 sentence summary of each of the last three releases from Browser Use"
```

The script will:

- Create a Kernel browser session
- Execute the Browser Use agent (using `BU 1.0` model) with your task
- Print the browser live view URL for monitoring
- Return the result and clean up resources

### Kernel Deployment

Deploy as a Kernel action:

```bash
kernel deploy main.py --env-file .env
```

Then invoke via API:

```bash
kernel invoke bu-model-python bu-api-task --payload '{"task": "Give me a 1 sentence summary of each of the last three releases from Browser Use"}'
```

## Configuration

The Browser Use agent is configured with:

- `ChatBrowserUse` Provider
- `BU 1.0` llm model
- Stealth mode enabled
- Automatic browser cleanup after task completion

See [main.py](main.py) for implementation details and customization options.

## Documentation

For more information, see the [Kernel<>Browser Use Integration Guide](https://www.kernel.sh/docs/integrations/browser-use).
