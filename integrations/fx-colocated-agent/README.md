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

[fx](https://fx.sh) is Vercel Labs' terminal-first coding agent.

this cookbook runs fx alongside chromium in the same linux environment. fx sends browser-control calls to the local playwright endpoint instead of routing each one through KERNEL's public api.

the script uses [file i/o](https://www.kernel.sh/docs/browsers/file-io) to upload the fx binary and a wrapper script, then uses [process execution](https://www.kernel.sh/docs/browsers/process-execution) to run them. fx still sends model requests to vercel ai gateway; only its browser-control calls use the local endpoint.

> this is a minimal end-to-end example of co-locating an agent with its browser. it demonstrates the mechanism, not a production deployment pattern.

## how it works

1. `kernel browsers create` starts a browser and returns its session id and live-view url.
2. `kernel browsers fs upload` copies a pinned, checksum-verified fx binary into the browser's linux environment.
3. the script uploads a wrapper that checks the local endpoint at `127.0.0.1:10001`, then teaches fx to send playwright code to it.
4. `kernel browsers process exec` runs the wrapper synchronously with the model, task, and vercel ai gateway credential in its environment. the script decodes stdout and stderr, then fails if the process returns a nonzero exit code.
5. an exit trap deletes the browser after success, failure, timeout, or interruption.

fx does not use a native KERNEL adapter in this example. its system prompt tells it to write a json payload containing playwright code and send that payload to the local endpoint with `curl`. the request body, available browser objects, and returned value follow the [playwright execution](https://www.kernel.sh/docs/browsers/playwright-execution) contract. because the endpoint listens on `127.0.0.1`, it is reachable only from processes running alongside that browser.

## prerequisites

- the [KERNEL cli](https://www.kernel.sh/docs/reference/cli), authenticated with `KERNEL_API_KEY` or `kernel login`
- a [vercel ai gateway](https://vercel.com/docs/ai-gateway) api key in `AI_GATEWAY_API_KEY`
- `curl`, `jq`, `mktemp`, `tar`, and either `sha256sum` or `shasum`

## run it

```bash
export KERNEL_API_KEY="your-kernel-api-key" # omit after `kernel login`
export AI_GATEWAY_API_KEY="your-ai-gateway-api-key"
./run.sh
```

## what a successful run looks like

the first two lines contain the browser session id and live-view url. open the live view while the script is running to watch fx drive chromium.

the final output is fx's json response. a successful response has an `exit_code` of `0` and a nonempty `final_output` containing five hacker news article titles. the titles change with the front page. after the script exits, its cleanup trap deletes the browser and the live-view url stops working.

## configuration

the script accepts these optional environment variables:

| variable | default | purpose |
| --- | --- | --- |
| `FX_MODEL` | `anthropic/claude-sonnet-4.5` | model requested through vercel ai gateway |
| `FX_TASK` | retrieve the top five hacker news titles | prompt given to fx |
| `FX_VERSION` | `v0.0.9` | pinned fx release uploaded to the browser environment |
| `FX_SHA256` | checksum for `v0.0.9` | expected checksum for the fx archive; update it with `FX_VERSION` |
| `BROWSER_TIMEOUT_SECONDS` | `900` | browser inactivity timeout |
| `PROCESS_TIMEOUT_SECONDS` | `90` | maximum time allowed for the synchronous fx process |

the wrapper uses `fx ask --yolo` because `process.exec` is non-interactive. this allows fx to run shell commands without asking for approval. use this example only with tasks and sites you trust. `AI_GATEWAY_API_KEY` is available to fx as an environment variable while it runs and appears in the local `kernel` cli arguments while the process starts. for production, call the process api through an sdk so the credential is sent in the request body instead of a command-line argument.

## adapt the example

- replace fx with another agent binary or script
- change `FX_TASK` and `FX_MODEL` for your workload
- use `process.spawn` with output streaming, status checks, and explicit termination for a long-running agent
- upload input files or retrieve generated artifacts with [file i/o](https://www.kernel.sh/docs/browsers/file-io)

## related

- [process execution](https://www.kernel.sh/docs/browsers/process-execution) — run commands and manage processes alongside the browser
- [file i/o](https://www.kernel.sh/docs/browsers/file-io) — transfer files to and from the browser environment
- [fx integration guide](https://www.kernel.sh/docs/integrations/vercel/fx) — give fx a KERNEL browser over mcp instead of co-locating it
