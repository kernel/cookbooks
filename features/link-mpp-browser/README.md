# Link MPP browser headlines

This TypeScript example uses Link to buy a test-mode Kernel browser through the Machine Payments Protocol (MPP), then prints the first seven Hacker News headlines. The browser expires after 30 minutes.

```sh
npm install -g @stripe/link-cli
cd features/link-mpp-browser
npm install
link-cli auth login
npm start
```

Approve the device login and the $0.50 test payment in the Link app when prompted. The example uses `https://api.dev.onkernel.com/mpp/browsers`; it needs no Kernel account or API key.
