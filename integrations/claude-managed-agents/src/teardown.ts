/**
 * Teardown: delete every durable resource the cookbook created.
 *
 * Reads .kernel-agent.json (written by src/setup.ts, then extended by the first
 * recipe run with the agent ids) and tears down, best-effort, in order:
 *   1. the vault            — vault delete CASCADES to its credentials, so the
 *                             environment_variable credential goes with it.
 *   2. the environment      — the cloud sandbox config.
 *   3. the agents           — the coordinator + worker (if a recipe created them).
 *                             Agents have NO delete; archive is the terminal
 *                             cleanup (read-only, no new sessions).
 *   4. .kernel-agent.json   — the local resource manifest.
 *
 * Each step is wrapped so a single failure (e.g. a resource already gone) is
 * logged and swallowed rather than aborting the rest of the teardown.
 *
 * Note: this does NOT delete sessions — sessions are short-lived and torn down in
 * the `finally` of each recipe (see config.deleteSession / waitUntilSettled).
 *
 * Requires ANTHROPIC_API_KEY in the environment.
 *
 * Run with: npm run teardown
 */
import { client, loadResources, RESOURCES_PATH, COOKBOOK_TAG } from "./config";
import { rm } from "node:fs/promises";

async function teardown() {
  // loadResources throws a helpful "run npm run setup" error if the manifest is
  // missing — let that propagate (nothing to tear down without it).
  const resources = await loadResources();

  console.log("--- Tearing down durable resources ---");

  // 1. Vault first. Deleting the vault cascades to all of its credentials.
  try {
    await client.beta.vaults.delete(resources.vaultId);
    console.log(
      `Deleted vault ${resources.vaultId} (cascaded credential ${resources.credentialId})`,
    );
  } catch (err) {
    console.error(`Failed to delete vault ${resources.vaultId}:`, err);
  }

  // 2. Environment.
  try {
    await client.beta.environments.delete(resources.environmentId);
    console.log(`Deleted environment ${resources.environmentId}`);
  } catch (err) {
    console.error(
      `Failed to delete environment ${resources.environmentId}:`,
      err,
    );
  }

  // 3. Agents — no delete endpoint, so archive is the terminal cleanup. They're
  //    NOT in the manifest (recipes find-or-create them by name), so find the
  //    cookbook's agents by their generic metadata tag and archive each active one.
  try {
    for await (const agent of client.beta.agents.list()) {
      if (agent.metadata?.["managed_by"] !== COOKBOOK_TAG) continue;
      try {
        await client.beta.agents.archive(agent.id);
        console.log(`Archived agent "${agent.name}" (${agent.id})`);
      } catch (err) {
        console.error(`Failed to archive agent ${agent.id}:`, err);
      }
    }
  } catch (err) {
    console.error("Failed while listing agents to archive:", err);
  }

  // 4. Remove the local manifest so a future `npm run setup` starts clean.
  try {
    await rm(RESOURCES_PATH);
    console.log(`Removed ${RESOURCES_PATH}`);
  } catch (err) {
    console.error(`Failed to remove ${RESOURCES_PATH}:`, err);
  }

  console.log("--- Teardown complete ---");
}

teardown().catch((err) => {
  console.error("\nTeardown failed:", err);
  process.exitCode = 1;
});
