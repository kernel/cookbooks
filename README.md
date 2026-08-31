<p align="center">
  <img src="https://raw.githubusercontent.com/kernel/kernel-images/main/static/images/logo-kernel-light.svg" alt="Kernel Logo" width="55%">
</p>

<p align="center">
  <img alt="GitHub License" src="https://img.shields.io/github/license/kernel/cookbooks">
  <a href="https://discord.gg/FBrveQRcud"><img src="https://img.shields.io/discord/1342243238748225556?logo=discord&logoColor=white&color=7289DA" alt="Discord"></a>
  <a href="https://x.com/juecd__"><img src="https://img.shields.io/twitter/follow/juecd__" alt="Follow @juecd__"></a>
  <a href="https://x.com/rfgarcia"><img src="https://img.shields.io/twitter/follow/rfgarcia" alt="Follow @rfgarcia"></a>
</p>

# Kernel Cookbooks

End-to-end recipes for agents that use the internet, powered by [Kernel](https://www.kernel.sh). Each cookbook is self-contained: clone, set your secrets, run.

## Features

Kernel product features, each shown in a small runnable example.

| Cookbook                                     | Description                                            |
| -------------------------------------------- | ------------------------------------------------------ |
| [proxies](features/proxies/)                 | Browser traffic routing through Kernel's proxy options |
| [profiles](features/profiles/)               | Persistent browser session state, reused across runs   |
| [replays](features/replays/)                 | Browser session recordings, downloadable as mp4        |
| [file-io](features/file-io/)                 | Downloads, uploads, and browser filesystem access      |
| [ad-blocker](features/ad-blocker/)           | Ad blocker extensions in Kernel browsers               |
| [chrome-policies](features/chrome-policies/) | Chromium Enterprise Policies in browser sessions       |

## Integrations

Kernel paired with the rest of your stack.

| Cookbook                                                               | Description                                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [modal-web-scraper](integrations/modal-web-scraper/)                   | Web scraper for JS-rendered pages behind a login, on Modal with a Kernel headful browser         |
| [modal-pr-qa-agent](integrations/modal-pr-qa-agent/)                   | PR preview QA agent with Claude computer use on Modal, recorded with Replays                     |
| [claude-managed-agents](integrations/claude-managed-agents/)           | Claude Managed Agents recipes: parallel computer-use agent swarms, API keys secured via Vaults   |
| [claude-computer-use-loop](integrations/claude-computer-use-loop/)     | Minimal implementation of Anthropic's computer use loop                                          |
| [ai-sdk-agent](integrations/ai-sdk-agent/)                             | Natural language browser automation with the Vercel AI SDK and Kernel's Playwright execution API |
| [stagehand-google-cua-agent](integrations/stagehand-google-cua-agent/) | Computer use agent with Google's Gemini 2.5 and Stagehand                                        |
| [browser-use-model](integrations/browser-use-model/)                   | Browser Use bu-1.0 model on Kernel browser infrastructure                                        |
| [mastra-web-task-assistant](integrations/mastra-web-task-assistant/)   | Human-in-the-loop web task assistant with memory, built on Mastra                                |
| [vibium](integrations/vibium/)                                         | Vibium browser automation over WebDriver BiDi                                                    |
| [tinker-rl](integrations/tinker-rl/)                                   | RL training for computer use agents, using Tinker                                                |

## Useful resources

- [Documentation](https://kernel.sh/docs)
- [API reference](https://www.kernel.sh/docs/api-reference/browsers/create-a-browser-session)
- [Agent-readable docs index](https://kernel.sh/docs/llms.txt) for giving your coding agent Kernel context
- [Hosted MCP server](https://www.kernel.sh/docs/reference/mcp-server) for tool-calling agents
- [CLI](https://www.kernel.sh/docs/reference/cli)
- [Discord](https://discord.gg/FBrveQRcud)
