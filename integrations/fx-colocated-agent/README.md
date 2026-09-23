```
 ⠀⠀⠀⠀⠀⠀⣠⣾⣿⣿⣿⠀⠀⠀⠀⠀⠀⠀⠀
 ⠀⠀⠀⠀⠀⢰⣿⡿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
 ⠀⠀⠀⣠⣶⣿⣿⣷⣶⡶⣶⣶⣆⠀⠀⠀⣴⣶⣶⠆   ⣤⣤⠀⠀⢀⣤⡤⠀⢠⣤⣤⣤⣤⣤⠀⠀⣤⣤⣤⣤⣤⡀⠀⠀⢠⣤⣤⠀⠀⢠⣤⡄⠀⢠⣤⣤⣤⣤⣤⠀⠀⣤⣤⠀⠀⠀⠀
 ⠀⠀⠀⠉⢹⣿⣿⠉⠉⠀⠘⢿⣿⣧⣀⣾⣿⡿⠃⠀   ⣿⣿⣀⣴⡿⠋⠀⠀⢸⣿⡇⠀⠀⠀⠀⠀⣿⣿⠀⠈⣿⣿⠀⠀⢸⣿⣿⣷⡀⢸⣿⡇⠀⢸⣿⡇⠀⠀⠀⠀⠀⣿⣿⠀⠀⠀⠀
 ⠀⠀⠀⠀⣼⣿⡏⠀⠀⠀⠀⠀⠻⣿⣿⣿⠟⠀⠀⠀   ⣿⣿⣿⣯⡀⠀⠀⠀⢸⣿⡷⠶⠶⠶⠀⠀⣿⣿⣤⣴⣿⡛⠀⠀⢸⣿⡇⢻⣷⣸⣿⡇⠀⢸⣿⡷⠶⠶⠶⠀⠀⣿⣿⠀⠀⠀⠀
 ⠀⠀⠀⢀⣿⣿⠃⠀⠀⠀⠀⢠⣦⠘⢿⣿⣷⡀⠀⠀   ⣿⣿⠈⠻⣿⣦⡀⠀⢸⣿⡇⠀⠀⠀⠀⠀⣿⣿⠀⠈⢿⣿⡄⠀⢸⣿⡇⠀⢻⣿⣿⡇⠀⢸⣿⡇⠀⠀⠀⠀⠀⣿⣿⠀⠀⠀⠀
 ⠀⠀⠀⣸⣿⡟⠀⠀⠀⠀⣰⣿⣿⠗⠀⠻⣿⣿⣄⠀   ⠛⠛⠀⠀⠈⠛⠛⠂⠘⠛⠛⠛⠛⠛⠀⠀⠛⠛⠀⠀⠈⠛⠛⠀⠘⠛⠃⠀⠀⠙⠛⠃⠀⠘⠛⠛⠛⠛⠛⠀⠀⠛⠛⠛⠛⠛⠃
 ⠀⠀⠀⣿⣿⠇⠀⠀⠀⠾⠿⠿⠋⠀⠀⠀⠘⠿⠿⠦
  ⠀⣸⣿⡿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
 ⣿⣿⣿⠟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
```

# fx, co-located with its browser

[fx](https://fx.sh) is Vercel Labs' terminal-first coding agent. This cookbook embeds fx's agent kernel, [`libfx`](https://fx.sh/docs/lib/node), directly inside a [KERNEL Browser REPL](https://www.kernel.sh/docs/browsers/repl) — a persistent Node.js process that lives alongside Chromium in the same VM. fx's tool calls run in-process against that VM's browser-control helpers; none of them leave the machine. Tool *results* — page content, accessibility snapshots, whatever `js` returns — still go out to the model over Vercel AI Gateway with each turn, the same as any other agent loop.

> this is a minimal end-to-end example of co-locating an agent with its browser. it demonstrates the mechanism, not a production deployment pattern.

## how it works

1. `kernel.browsers.create()` starts a browser and returns its session id and live-view url.
2. `kernel.browsers.process.exec()` runs `npm install -g libfx` in the browser's linux environment.
3. `kernel.browsers.repl()` sends one script into the browser's persistent Node runtime. That script:
   - dynamically imports `libfx` and creates an fx agent with the Vercel AI Gateway credential
   - gives the agent five tools — `goto`, `snapshot`, `click`, `type`, and `js` — whose `execute()` callbacks call the REPL's own browser-control helpers (`gotoUrl`, `accessibilitySnapshot`, `click`, `fillInput`, `js`) directly, with no network hop
   - runs the agent's turn to completion and writes the result back with `repl.write(...)`
4. a `finally` block deletes the browser after success, failure, timeout, or interruption.

## prerequisites

- node.js and pnpm (or npm/yarn)
- a [Kernel](https://www.kernel.sh) api key in `KERNEL_API_KEY`
- a [vercel ai gateway](https://vercel.com/docs/ai-gateway) api key in `AI_GATEWAY_API_KEY`

## run it

```bash
pnpm install
export KERNEL_API_KEY="your-kernel-api-key"
export AI_GATEWAY_API_KEY="your-ai-gateway-api-key"
pnpm start
```

## what a successful run looks like

the first two lines contain the browser session id and live-view url. open the live view while the script is running to watch fx drive chromium.

the final output is fx's answer text. the default task asks for five hacker news article titles, which change with the front page. the script deletes the browser when it exits and the live-view url stops working.

## the tools

| tool | purpose |
| --- | --- |
| `goto` | navigate to a url, wait for load, return page info |
| `snapshot` | get an accessibility-tree snapshot; each node's `backendNodeId` is what `click` and `type` act on |
| `click` | click a node's `backendNodeId` from the most recent snapshot |
| `type` | fill an input node's `backendNodeId` from the most recent snapshot, optionally pressing enter |
| `js` | evaluate a javascript function body against the page for anything the other tools can't express |

`backendNodeId`s go stale once the DOM changes — the agent's instructions tell it to re-snapshot after navigating or acting.

## configuration

the script accepts these optional environment variables:

| variable | default | purpose |
| --- | --- | --- |
| `FX_MODEL` | `anthropic/claude-sonnet-5` | model requested through vercel ai gateway |
| `FX_TASK` | retrieve the top five hacker news titles | prompt given to fx |
| `LIBFX_VERSION` | `0.0.10` | pinned `libfx` version installed into the browser environment |
| `BROWSER_TIMEOUT_SECONDS` | `900` | browser inactivity timeout |
| `PROCESS_TIMEOUT_SECONDS` | `60` | maximum time allowed for the `npm install` |
| `REPL_TIMEOUT_SECONDS` | `300` | maximum time allowed for the agent's REPL execution |

`AI_GATEWAY_API_KEY` is embedded into the code string sent to `kernel.browsers.repl()` in the request body, never passed as a `process.exec` command-line argument, so it never appears in local `ps` output.

## adapt the example

- add more tools (`scroll`, `emitImage` for screenshots) as your tasks need them
- change `FX_TASK` and `FX_MODEL` for your workload
- consume `tool_start`/`tool_end` events from `agent.prompt(...)` if you want to stream progress instead of only the final answer
- upload input files or retrieve generated artifacts with [file i/o](https://www.kernel.sh/docs/browsers/file-io)

## related

- [Browser REPL](https://www.kernel.sh/docs/browsers/repl) — persistent JavaScript execution in the browser's VM
- [libfx](https://fx.sh/docs/lib/node) — fx's embeddable agent kernel for JavaScript hosts
- [fx integration guide](https://www.kernel.sh/docs/integrations/vercel/fx) — give fx a KERNEL browser over mcp instead of co-locating it
