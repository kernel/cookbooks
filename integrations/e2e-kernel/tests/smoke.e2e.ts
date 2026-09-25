import { expect } from "e2e";
import { test } from "@e2edev/web";

test("finds the browser session documentation", async ({ app, agent, screen }) => {
  await app.open("/docs/api-reference/browsers/create-a-browser-session");
  await agent.act("find the section that explains how to create a browser session");
  await agent.assert("the page explains how to create a browser session");
  await expect(
    screen.getByRole("heading", { name: "Create a browser session" }),
  ).toBeVisible();
});

test("has a changelog entry from the last eight days", async ({ app, web }) => {
  await app.open("/changelog");
  const latestEntry = await web.evaluate(
    () => document.querySelector("time")?.textContent?.trim() ?? "",
  );
  const postedAt = Date.parse(
    `${latestEntry} ${new Date().getUTCFullYear()} UTC`,
  );
  const age = Date.now() - postedAt;

  expect(latestEntry).not.toBe("");
  expect(Number.isNaN(postedAt)).toBe(false);
  expect(age).toBeGreaterThanOrEqual(0);
  expect(age).toBeLessThan(8 * 24 * 60 * 60 * 1000);
});

test("shows the smooth versus linear drag GIF", async ({
  app,
  web,
}) => {
  await app.open("/docs/browsers/computer-controls");
  const section = web.locator("#smooth-vs-linear-drag");
  const gif = web.locator('img[data-path="images/smooth-drag-demo.gif"]');

  await section.scrollIntoView();
  await expect(section).toBeVisible();
  await gif.scrollIntoView();
  await expect(gif).toBeVisible();
});
