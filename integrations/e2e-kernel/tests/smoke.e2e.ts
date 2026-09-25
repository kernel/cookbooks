import { expect, test } from "e2e";

test("finds the browser session documentation", async ({ app, agent, screen }) => {
  await app.open("/docs/api-reference/browsers/create-a-browser-session");
  await agent.act("find the section that explains how to create a browser session");
  await agent.assert("the page explains how to create a browser session");
  await expect(
    screen.getByRole("heading", { name: "Create a browser session" }),
  ).toBeVisible();
});
