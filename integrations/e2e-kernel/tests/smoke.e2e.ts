import { expect, test } from "e2e";

test("navigates the MagniTasks dashboard", async ({ app, agent, screen }) => {
  await app.open("/");
  await agent.act("open the Projects page from the navigation");
  await agent.assert("the Projects page is visible");
  await expect(screen.getByRole("heading", { name: "Projects" })).toBeVisible();
});
