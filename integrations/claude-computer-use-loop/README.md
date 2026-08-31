# Computer Controls - Anthropic Computer Use with Kernel

A minimal SDK implementation of Anthropic's Computer Use loop that drives Kernel browsers using screenshots from Kernel's Computer Controls API.

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Set environment variables by creating a `.env` file in the project root:

```bash
ANTHROPIC_API_KEY=your-anthropic-api-key
KERNEL_API_KEY=your-kernel-api-key  # Optional if configured elsewhere
```

Alternatively, you can export them in your shell:

```bash
export ANTHROPIC_API_KEY="your-anthropic-api-key"
export KERNEL_API_KEY="your-kernel-api-key"  # Optional if configured elsewhere
```

## Usage

Run the Computer Use loop with a prompt:

```bash
npx tsx index.ts "Your task prompt here"
```

Example:

```bash
npx tsx index.ts "Navigate to google.com and search for TypeScript"
```

## How it works

1. Creates a Kernel browser session
2. Captures screenshots using Kernel's Computer Controls API
3. Sends screenshots to Claude with the Computer Use tool
4. Executes the actions returned by Claude (clicks, typing, scrolling, etc.)
5. Repeats until the task is complete or max iterations reached

The loop supports:

- Mouse clicks
- Typing text
- Pressing keys
- Scrolling
- Dragging

## Requirements

- Node.js 18+
- Anthropic API key
- Kernel API key
