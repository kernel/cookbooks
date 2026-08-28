# Kernel + Vibium Examples

This directory is a small starter set of examples for using Vibium with Kernel over WebDriver BiDi.

Each example follows the same shape:

1. Create a browser with Kernel.
2. Read the typed `webdriver_ws_url` from the browser-create response.
3. Connect Vibium to that BiDi endpoint.
4. Open a simple page and assert the title and `<h1>`.
5. Delete the Kernel browser session during cleanup.

## Layout

- `cli/kernel-vibium-cli-example.sh`: shell example using the `kernel` CLI and the globally installed `vibium` CLI.
- `ts/kernel-vibium-node-example.ts`: TypeScript example using `@onkernel/sdk` plus Vibium's async JS/TS API.
- `python/kernel-vibium-python-example.py`: Python example using `kernel` plus Vibium's Python API.

## Prerequisites

Set this environment variable before running anything:

```bash
export KERNEL_API_KEY="your-kernel-api-key"
```

You will also want:

- Node 20+
- Python 3.11+
- `jq`

Install the tools you need:

```bash
# CLI
# Kernel (See https://www.kernel.sh/docs/reference/cli)
npm install -g @onkernel/cli
# Vibium
npm install -g vibium

# TypeScript
cd ts
npm install

# Python
cd ../python
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## CLI Example

```bash
cd cli
./kernel-vibium-cli-example.sh
```

## TypeScript Example

Install dependencies and type-check the example:

```bash
cd ts
npm install
npm run check
```

Run the example:

```bash
cd ts
npm run build
npm run start
```

## Python Example

Create a virtual environment, install requirements, and syntax-check:

```bash
cd python
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m py_compile kernel-vibium-python-example.py
```

Run the example:

```bash
cd python
source .venv/bin/activate
python kernel-vibium-python-example.py
```

## Notes

- The CLI, Node, and Python examples rely on the standard `KERNEL_API_KEY` environment variable instead of passing credentials in code.
- The TypeScript and Python examples use the typed `webdriver_ws_url` field returned by the Kernel SDK.
- The WebDriver BiDi URL is treated as sensitive session data, so the examples avoid logging the full query string.
- All examples default to `https://example.com` so the expected result is easy to reason about: title and `h1` should both equal `Example Domain`.
