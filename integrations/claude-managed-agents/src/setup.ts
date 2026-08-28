/**
 * One-time setup for the Kernel x Claude Managed Agents cookbook.
 *
 * Creates the durable, workspace-scoped infra every recipe reuses.
 *
 * The created ids are persisted to .kernel-agent.json via saveResources() so the
 * recipes (src/ux-swarm.ts, src/lead-intel.ts, ...) can load them.
 *
 * Run with: npm run setup
 */
import {
  client,
  KERNEL_NETWORK_HOSTS,
  KERNEL_SECRET_HOSTS,
  saveResources,
  type Resources,
} from "./config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(`\nMissing required environment variable: ${name}`);
    console.error(
      `Set it before running setup. See .env.example for the full list.`,
    );
    if (name === "KERNEL_API_KEY") {
      console.error(
        `Get a Kernel API key from https://dashboard.onkernel.com and export it:`,
      );
      console.error(`  export KERNEL_API_KEY=...`);
    }
    process.exit(1);
  }
  return value;
}

async function main() {
  requireEnv("ANTHROPIC_API_KEY");
  const kernelApiKey = requireEnv("KERNEL_API_KEY");

  console.log(
    "Setting up Kernel x Managed Agents cookbook infrastructure...\n",
  );

  // 1. ENVIRONMENT — the sandbox the workers run in.
  //    - packages: preinstall the Kernel CLI into the image so workers can run
  //      `kernel ...` immediately, with no per-run `npm install` (and no race
  //      between the parallel workers all installing it at once).
  //      PINNED to 0.32.0: it is the last version that routes ALL browser
  //      commands (playwright execute, computer *) server-side through
  //      api.onkernel.com:443. From 0.33.0 the CLI dials the browser node
  //      directly on port 8443, which Managed Agents cloud sandboxes cannot
  //      reach (outbound non-443 ports time out, even with `unrestricted`
  //      networking) — every browser command then fails with
  //      "dial tcp <ip>:8443: i/o timeout". Re-verify before bumping the pin.
  //    - networking: "limited" + allowed_hosts on the Kernel control-plane hosts
  //      (api.onkernel.com); allow_package_managers lets the image fetch the
  //      preinstalled package (and leaves room for ad-hoc installs).
  const env = await client.beta.environments.create({
    name: `kernel-cookbook-env-${Date.now()}`,
    config: {
      type: "cloud",
      packages: { npm: ["@onkernel/cli@0.32.0"] },
      networking: {
        type: "limited",
        allow_package_managers: true,
        allow_mcp_servers: false,
        allowed_hosts: [...KERNEL_NETWORK_HOSTS],
      },
    },
  });
  console.log(`Environment: ${env.id}`);

  // 2. VAULT — a workspace-scoped container for the credential. Anyone with a
  //    workspace API key can reference it by id; the secret itself is write-only
  //    and never returned by the API.
  const vault = await client.beta.vaults.create({
    display_name: "Kernel cookbook vault",
    metadata: { purpose: "kernel-cookbook" },
  });
  console.log(`Vault: ${vault.id}`);

  // 3. CREDENTIAL — the credential networking plane. The sandbox
  //    env var holds an opaque placeholder; the real secret_value below is
  //    substituted only when the placeholder appears in an outbound request to one
  //    of these allowed_hosts.
  const cred = await client.beta.vaults.credentials.create(vault.id, {
    display_name: "Kernel API key",
    auth: {
      type: "environment_variable",
      secret_name: "KERNEL_API_KEY",
      secret_value: kernelApiKey,
      networking: {
        type: "limited",
        allowed_hosts: [...KERNEL_SECRET_HOSTS],
      },
    },
  });
  console.log(`Credential: ${cred.id}`);

  // Persist the infra ids. Agent ids are filled in lazily by the first recipe
  // run (config.ensureAgents), not here.
  const resources: Resources = {
    environmentId: env.id,
    vaultId: vault.id,
    credentialId: cred.id,
  };
  await saveResources(resources);

  console.log("\n--- Setup complete ---");
  console.log(`Environment ID: ${resources.environmentId}`);
  console.log(`Vault ID:       ${resources.vaultId}`);
  console.log(`Credential ID:  ${resources.credentialId}`);
  console.log(`\nSaved to .kernel-agent.json. Next: run a recipe!`);
}

main().catch((err) => {
  console.error("\nSetup failed:", err);
  process.exitCode = 1;
});
