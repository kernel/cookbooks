import { z } from "zod";
import { expect, test } from "e2e";

test("finds the browser session documentation", async ({ app, agent, screen }) => {
  await app.open("/docs/api-reference/browsers/create-a-browser-session");
  await agent.act("find the section that explains how to create a browser session");
  await agent.assert("the page explains how to create a browser session");
  await expect(
    screen.getByRole("heading", { name: "Create a browser session" }),
  ).toBeVisible();
});

test("extracts the browser session endpoint", async ({ app, agent }) => {
  await app.open("/docs/api-reference/browsers/create-a-browser-session");
  const endpoint = await agent.extract(
    "read the HTTP method and endpoint path for creating a browser session",
    {
      schema: z.object({
        method: z.string(),
        path: z.string(),
      }),
    },
  );

  expect(endpoint.method.toUpperCase()).toBe("POST");
  expect(endpoint.path).toBe("/browsers");
});

test("waits for the browser session request example", async ({
  app,
  agent,
  screen,
}) => {
  await app.open("/docs/api-reference/browsers/create-a-browser-session");
  await agent.waitFor("the page shows the POST /browsers request example");
  await expect(
    screen.getByText("/browsers", { exact: true }).first(),
  ).toBeVisible();
});
