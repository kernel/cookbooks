# MPP browser headlines

This example buys a test-mode browser through the Machine Payments Protocol (MPP), connects to it with Playwright, and prints the first seven Hacker News story headlines. The browser expires after 30 minutes.

```sh
npm install -g @stripe/link-cli
python -m pip install playwright
link-cli auth login
python features/mpp/headlines.py
```

Approve the device login and the test payment in Link when prompted. The script uses `https://api.dev.onkernel.com/mpp/browsers` and requests a $0.50 test-mode payment; it needs no Kernel API key.
