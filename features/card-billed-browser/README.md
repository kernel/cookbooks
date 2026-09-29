# Credit card billed browser headlines

This TypeScript example creates a Kernel browser, reads the top seven Hacker News headlines, and deletes the session. Browser usage is billed to your Kernel account, which can have a credit card as its payment method. It does not send card details to the browser API or use the MPP endpoint.

Add a credit card in your Kernel account's billing settings. Then set your API key and run:

```sh
cd features/card-billed-browser
npm install
export KERNEL_API_KEY=your_api_key
npm start
```
