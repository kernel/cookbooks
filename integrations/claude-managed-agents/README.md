# Claude Managed Agents + Kernel Browsers

A cookbook showing how to use **Claude Managed Agents** alongside [Kernel](https://www.kernel.sh) browsers.

---

## Cookbook

Each recipe in this cookbook uses

- [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview): Anthropic's cloud agent harness.
- [Vaults](https://platform.claude.com/docs/en/managed-agents/vaults): A feature of Claude Managed Agents that allows for securely storing secrets, with newly-added support for environment variable secrets.
- [Kernel](https://www.kernel.sh): Crazy fast browser infra for agents.
- [Kernel CLI](https://www.kernel.sh/docs/reference/cli): the `kernel` CLI gives your agent a way to provision browsers and control them, e.g. via computer use.

### Recipes

- [`src/ux-swarm.ts`](./src/ux-swarm.ts) contains an example of an agent that spins up a swarm of browsers in parallel all testing different parts of a website via computer use. ([example output](./examples/ux-swarm-kernel-sh.md))
- [`src/lead-intel.ts`](./src/lead-intel.ts) takes a customer lead's site and comes up with parallelizable research tasks (e.g. products, pricing plans, how they measure usage, etc.) and delegates each task to a subagent armed with a Kernel browser. ([example output](./examples/lead-intel-modal.md))

## Prerequisites

- **Node.js 22+** (the scripts run with [`tsx`](https://github.com/privatenumber/tsx); ESM, no build step).
- **`ANTHROPIC_API_KEY`** — drives Managed Agents (vaults, agents, sessions). Get one at <https://console.anthropic.com/>.
- **`KERNEL_API_KEY`** — get one from the Kernel dashboard at <https://dashboard.onkernel.com/>.

## How it works

There are **two distinct networking planes**. Do not conflate them.

### (A) Environment networking — what the sandbox can reach at all

This is a firewall on the container. `setup.ts` sets it to **`limited`**, 443-only:

```ts
config.networking = {
  type: "limited",
  allow_package_managers: true, // lets npm/pip install @onkernel/cli
  allow_mcp_servers: false,
  allowed_hosts: ["api.onkernel.com", "*.onkernel.com"],
};
```

That's all the recipe needs: it drives the browser entirely over Kernel's CLI via `kernel browsers computer` / `kernel browsers playwright execute  /  kernel browsers screenshot`/ etc.

> **Why the CLI is pinned to `@onkernel/cli@0.32.0`:** through 0.32.0 every browser command is routed server-side through `api.onkernel.com:443`. From 0.33.0 the CLI dials the browser node's data plane directly on **port 8443** (`proxy.<cluster>.onkernel.com:8443` / `prod-<node>.kernel.sh:8443`). Managed Agents cloud sandboxes only allow outbound 443 — non-443 ports time out even under `unrestricted` networking, and `allowed_hosts` cannot express ports — so an unpinned CLI fails every browser command with `dial tcp <ip>:8443: i/o timeout`. Re-verify the dial targets before bumping the pin.

### (B) Credential networking — where the placeholder becomes the real secret

Set on the credential's `auth` block:

```ts
auth.networking = {
  type: "limited",
  allowed_hosts: ["api.onkernel.com", "*.onkernel.com"],
};
```

This governs **substitution**, not reachability. The sandbox env var `KERNEL_API_KEY` holds an opaque placeholder. Anthropic substitutes the real secret into an outbound request **only when the placeholder appears in a request to an allowed host**. The plaintext key never lands in the container, never enters the model's context, and is never logged by your code.

The list is scoped to exactly where the key is consumed — the `.com` Kernel control plane. Keep this list as tight as the workload allows — it is the only thing standing between a prompt-injected agent and your real key (next section).

---

## Run it

### 1. Setup (durable resources)

```bash
npm install
cp .env.example .env   # then fill in ANTHROPIC_API_KEY and KERNEL_API_KEY
npm run setup
```

Creates the durable, reusable infrastructure and writes their ids to `.kernel-agent.json`:

- a **cloud environment** with the _(A)_ limited networking shown above,
- a **vault** plus an `environment_variable` **credential** (`secret_name: KERNEL_API_KEY`)
  with the _(B)_ limited credential networking shown above.

Run this once. Every recipe reuses these ids.

### 2. Run a recipe

Each recipe takes the target site as a **required** URL argument:

```bash
npm run ux-swarm -- https://example.com
```

or

```bash
npm run lead-intel -- https://acme.com
```

### 3. Teardown

```bash
npm run teardown
```

Deletes the environment, deletes the vault (which cascades to its credentials), and
**archives** the cookbook's agents (agents have no delete — archive is the terminal
state). Then removes `.kernel-agent.json`.
