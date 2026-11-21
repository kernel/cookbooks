import { afterEach, expect, test } from "bun:test";
import { createApp } from "./app";

const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});

function fixture(
  authorizeFails = false,
  overrides: Record<string, unknown> = {},
) {
  let approved = false;
  let authorizations = 0;
  let purchase: Record<string, unknown> | undefined;
  const api = Bun.serve({
    port: 0,
    fetch: async (request) => {
      if (request.method === "PUT") {
        purchase = await request.json();
      } else if (request.method === "POST") {
        authorizations++;
        if (authorizeFails)
          return new Response("upstream unavailable", { status: 503 });
      }
      return Response.json({
        type: "card",
        state: {
          status: approved ? "ready" : "pending_authorization",
          funding_status: "available",
        },
        available_operations: [{ type: approved ? "fill" : "authorize" }],
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        action: approved
          ? undefined
          : {
              name: "spend_approval",
              url: "https://vault.kernel.sh/card-approval#token=test",
            },
        ...overrides,
      });
    },
  });
  servers.push(api);
  const app = createApp({
    apiKey: "server-only-test-key",
    apiOrigin: api.url.origin,
    vault: "sample-vault",
    wallet: "card-wallet",
    paymentMethod: "card",
    amount: 4800,
    currency: "usd",
    merchantName: "example museum",
    merchantURL: "https://shop.example.com/checkout",
    merchantCountry: "US",
  });
  const server = Bun.serve({ port: 0, fetch: app });
  servers.push(server);
  return {
    server,
    approve: () => {
      approved = true;
    },
    authorizations: () => authorizations,
    purchase: () => purchase,
  };
}

test("opens hosted approval and becomes ready without submitting checkout", async () => {
  const f = fixture();
  const response = await fetch(new URL("/api/purchase", f.server.url), {
    method: "POST",
    headers: { Origin: f.server.url.origin },
  });
  const waiting = await response.json();
  expect(waiting.approvalURL).toBe(
    "https://vault.kernel.sh/card-approval#token=test",
  );
  expect(waiting.ready).toBe(false);
  expect(f.purchase()).toMatchObject({
    type: "card",
    spec: { provider: "kernel", amount: 4800, merchant_country: "US" },
  });
  f.approve();
  const ready = await fetch(new URL("/api/purchase", f.server.url)).then((r) =>
    r.json(),
  );
  expect(ready.ready).toBe(true);
  expect(ready.message).toContain("checkout has not been submitted");
  expect(JSON.stringify(ready)).not.toContain("server-only-test-key");
  expect(f.authorizations()).toBe(1);
});

test("an uncertain authorization cannot be repeated by a second click", async () => {
  const f = fixture(true);
  const options = { method: "POST", headers: { Origin: f.server.url.origin } };
  const first = await fetch(new URL("/api/purchase", f.server.url), options);
  expect(first.status).toBe(502);
  const second = await fetch(new URL("/api/purchase", f.server.url), options);
  expect(second.status).toBe(409);
  expect(f.authorizations()).toBe(1);
});

test("cross-origin requests cannot create a purchase", async () => {
  const f = fixture();
  const response = await fetch(new URL("/api/purchase", f.server.url), {
    method: "POST",
    headers: { Origin: "https://untrusted.example" },
  });
  expect(response.status).toBe(403);
  expect(f.purchase()).toBeUndefined();
});

test.each([
  { state: { status: "ready", funding_status: "removed" } },
  { expires_at: "2000-01-01T00:00:00Z" },
])(
  "never offers approval or readiness for an unusable purchase: %j",
  async (overrides) => {
    const f = fixture(false, overrides);
    const response = await fetch(new URL("/api/purchase", f.server.url), {
      method: "POST",
      headers: { Origin: f.server.url.origin },
    });
    const result = await response.json();
    expect(result.ready).toBe(false);
    expect(result.approvalURL).toBeUndefined();
  },
);

test("a CVC action is not offered as Visa network-token approval", async () => {
  const f = fixture(false, {
    action: {
      name: "spend_approval",
      url: "https://vault.kernel.sh/card-cvc#token=test",
    },
  });
  const response = await fetch(new URL("/api/purchase", f.server.url), {
    method: "POST",
    headers: { Origin: f.server.url.origin },
  });
  const result = await response.json();
  expect(result.approvalURL).toBeUndefined();
  expect(result.message).toContain("different approval flow");
});
