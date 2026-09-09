# fx, co-located with its browser

Runs [fx](https://fx.sh), Vercel Labs' terminal-first coding agent, *inside* the same Kernel browser VM as the Chromium instance it drives — instead of connecting to the browser remotely over Kernel's public API or MCP server.

Normally an agent drives a Kernel browser from outside the VM: each tool call is a network round trip to Kernel's API, which then talks to the browser. This recipe uploads the fx binary directly into the VM (via [process execution](https://www.kernel.sh/docs/browsers/process-execution)) and points it at the VM's local `kernel-images` playwright daemon on `127.0.0.1:10001`. Every tool call becomes a loopback request instead of a hop through Kernel's control plane, which matters for latency-sensitive or high-tool-call-volume agent loops.

## How it works

1. `kernel browsers create` starts a browser session.
2. `kernel browsers fs upload` copies the fx binary into the VM, and `kernel browsers process exec` marks it executable.
3. A small wrapper script (`run_fx.sh`) is uploaded the same way. It sets a system prompt telling fx to drive the browser by POSTing Playwright code to the in-VM playwright daemon, then calls `fx ask`.
4. `kernel browsers process exec` runs the wrapper synchronously inside the VM, with `AI_GATEWAY_API_KEY` and `FX_MODEL` passed through as process environment variables.
5. `kernel browsers delete` tears down the session.

## Prerequisites

- [Kernel CLI](https://www.kernel.sh/docs/reference/cli), authenticated (`KERNEL_API_KEY` set or `kernel login` run).
- `jq`, to parse the session ID out of `kernel browsers create`'s JSON output.
- An [AI Gateway](https://vercel.com/docs/ai-gateway) API key (`AI_GATEWAY_API_KEY`), which fx uses to reach the model.

## Run it

```bash
export KERNEL_API_KEY="your-kernel-api-key"
export AI_GATEWAY_API_KEY="your-ai-gateway-api-key"
./run.sh
```

The script prints fx's JSON result, which includes the top 5 Hacker News article titles fx retrieved by driving the co-located browser.

## Related

- [Process execution](https://www.kernel.sh/docs/browsers/process-execution) — running commands inside a browser VM.
- [File I/O](https://www.kernel.sh/docs/browsers/file-io) — uploading and downloading files from a browser VM.
- [fx integration guide](https://www.kernel.sh/docs/integrations/vercel/fx) — the standard (non-co-located) way to give fx a Kernel browser over MCP.
