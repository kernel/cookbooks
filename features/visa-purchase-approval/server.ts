import { createApp } from "./app";

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 3006),
  fetch: createApp({
    apiKey: process.env.KERNEL_API_KEY ?? "",
    projectID: process.env.KERNEL_PROJECT_ID,
    vault: process.env.KERNEL_VAULT ?? "",
    wallet: process.env.KERNEL_WALLET ?? "",
    paymentMethod: process.env.KERNEL_PAYMENT_METHOD_ID ?? "",
    amount: 4800,
    currency: "usd",
    merchantName: "example museum",
    merchantURL: "https://shop.example.com/checkout",
    merchantCountry: "US",
  }),
});

console.log(`open ${server.url.origin}`);
