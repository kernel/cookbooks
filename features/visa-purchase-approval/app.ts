export type Config = {
  apiKey: string;
  apiOrigin?: string;
  projectID?: string;
  vault: string;
  wallet: string;
  paymentMethod: string;
  amount: number;
  currency: string;
  merchantName: string;
  merchantURL: string;
  merchantCountry: string;
};

type Card = {
  type: string;
  state: { status: string; funding_status?: string };
  available_operations: { type: string }[];
  expires_at?: string;
  action?: { name: string; url: string };
};

export function createApp(config: Config) {
  let key: string | undefined;
  const configured = Boolean(
    config.apiKey && config.vault && config.wallet && config.paymentMethod,
  );
  const purchase = {
    merchant: config.merchantName,
    amount: config.amount,
    currency: config.currency,
    merchantURL: config.merchantURL,
  };
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'",
  };
  const json = (body: object, status = 200) =>
    Response.json(body, { status, headers });

  async function api(
    path: string,
    method = "GET",
    body?: object,
  ): Promise<Card> {
    const response = await fetch(
      `${config.apiOrigin ?? "https://api.onkernel.com"}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          ...(config.projectID && { "X-Kernel-Project-Id": config.projectID }),
        },
        body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      },
    );
    if (!response.ok) throw new Error(`KERNEL returned ${response.status}`);
    return response.json();
  }

  function view(card: Card) {
    if (card.type !== "card" || card.state === undefined)
      throw new Error("Expected a card");
    const status = card.state.status;
    const unexpired = Date.parse(card.expires_at ?? "") > Date.now();
    const funded = card.state.funding_status === "available";
    const ready =
      status === "ready" &&
      funded &&
      unexpired &&
      card.available_operations.some((operation) => operation.type === "fill");
    let approvalURL: string | undefined;
    let message = `purchase status: ${status}. checkout has not been submitted.`;
    if (ready)
      message = "approved and ready to fill. checkout has not been submitted.";
    if (
      funded &&
      unexpired &&
      status === "pending_authorization" &&
      card.action?.name === "spend_approval"
    ) {
      const url = new URL(card.action.url);
      if (
        url.origin === "https://vault.kernel.sh" &&
        url.pathname === "/card-approval"
      ) {
        approvalURL = card.action.url;
        message =
          "open the hosted page, complete verification and approve this purchase.";
      } else {
        message =
          "this card returned a different approval flow. this sample requires a visa network-token purchase.";
      }
    }
    return {
      configured,
      started: true,
      purchase,
      status,
      ready,
      approvalURL,
      expiresAt: card.expires_at,
      message,
    };
  }

  return async (request: Request) => {
    const url = new URL(request.url);
    if (!["localhost", "127.0.0.1"].includes(url.hostname))
      return json({ message: "localhost only" }, 403);
    if (
      request.method === "POST" &&
      request.headers.get("Origin") !== url.origin
    ) {
      return json({ message: "same-origin requests only" }, 403);
    }
    if (url.pathname === "/api/purchase") {
      if (!["GET", "POST"].includes(request.method))
        return json({ message: "method not allowed" }, 405);
      if (request.method === "POST" && key)
        return json(
          {
            message:
              "a purchase already exists. check its status; do not repeat authorization.",
          },
          409,
        );
      if (request.method === "POST" && !configured)
        return json(
          { message: "set the wallet environment variables first." },
          400,
        );
      if (request.method === "GET" && !key)
        return json({
          configured,
          started: false,
          purchase,
          message: configured
            ? "review this purchase before authorizing it."
            : "configure an enrolled wallet in .env to start.",
        });
      try {
        const prefix = `/vaults/${encodeURIComponent(config.vault)}/items/`;
        if (request.method === "POST") {
          // Keep this key even if a request fails: an uncertain result must not create another purchase.
          key = `approval-example-${crypto.randomUUID()}`;
          const path = prefix + encodeURIComponent(key);
          const card = await api(path, "PUT", {
            type: "card",
            spec: {
              provider: "kernel",
              wallet: config.wallet,
              payment_method_id: config.paymentMethod,
              amount: config.amount,
              currency: config.currency,
              merchant_name: config.merchantName,
              merchant_url: config.merchantURL,
              merchant_country: config.merchantCountry,
            },
          });
          if (
            card.available_operations.some(
              (operation) => operation.type === "authorize",
            )
          ) {
            await api(`${path}/operations`, "POST", { type: "authorize" });
          }
        }
        return json(
          view(await api(`${prefix}${encodeURIComponent(key!)}?wait=10`)),
        );
      } catch {
        return json(
          {
            started: Boolean(key),
            message:
              "could not confirm the request. check the existing purchase status; do not repeat authorization.",
          },
          502,
        );
      }
    }
    const assets: Record<string, string> = {
      "/": "index.html",
      "/app.js": "app.js",
      "/style.css": "style.css",
      "/wordmark.svg": "wordmark.svg",
    };
    if (request.method === "GET" && assets[url.pathname]) {
      return new Response(
        Bun.file(new URL(`./public/${assets[url.pathname]}`, import.meta.url)),
        { headers },
      );
    }
    return json({ message: "not found" }, 404);
  };
}
