# Link MPP browser headlines

This TypeScript example uses Link to buy a Kernel browser through the Machine Payments Protocol (MPP), then prints the first seven Hacker News headlines. The browser expires after 30 minutes.

This is a production payment. The current offer is $0.50 for one browser; confirm the amount in Link before approving.

```sh
npm install -g @stripe/link-cli
cd features/link-mpp-browser
npm install
link-cli auth login
npm start
```

Approve the device login and payment in the Link app when prompted. The example uses `https://api.onkernel.com/mpp/browsers`; it needs no Kernel account or API key.
