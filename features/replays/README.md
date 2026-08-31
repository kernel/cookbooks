# 🕵️ AI-Powered E-commerce QA Demo

> **Watch AI agents autonomously test your e-commerce site and generate reviewable browser replays**

An intelligent quality assurance system that uses AI agents to automatically test e-commerce websites, powered by [Kernel](https://www.kernel.sh) and [Browser Use](https://github.com/browser-use/browser-use).

[![Demo](https://img.shields.io/badge/Demo-Live-brightgreen)](https://www.kernel.sh/docs/browsers/replays)
[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![Kernel Replays Youtube Video Screenshot](https://github.com/user-attachments/assets/369bfca3-9f52-425a-b754-dab8d7e47f33)](https://www.youtube.com/watch?v=eFXD75U60Bc)

---

## 💡 Why This Matters

Traditional QA testing is manual, time-consuming, and error-prone. This demo shows how AI agents can:

- ✅ **Automate visual testing** - Agents "see" and evaluate product images like a human QA tester would
- 🔄 **Execute complex workflows** - Navigate multi-step user journeys autonomously
- 📹 **Provide reviewable evidence** - Every action is recorded as a browser replay
- 🎯 **Scale effortlessly** - Test hundreds of products in the time it takes to test one manually

This is the future of QA: AI agents that think, see, and validate like your best QA engineer.

## 🎯 What This Demo Does

This application showcases **dual-phase AI-powered QA testing** on e-commerce sites:

### Phase 1: Product Page Intelligence 🛍️

- **Navigate** to product URLs autonomously
- **Evaluate** if product images accurately match title descriptions
- **Interact** with the page to add items to cart
- **Report** PASS/FAIL verdict with detailed assessment

### Phase 2: Cart Page Validation 🛒

- **Navigate** to cart using the site's natural UI flow
- **Verify** the item added in Phase 1 is present in the cart
- **Validate** the cart badge count matches the cart contents
- **Report** PASS/FAIL verdict with findings

### Phase 3: Replay Generation 🎥

Each testing phase is automatically recorded as a **browser replay**, allowing you to:

- See exactly what the AI agent saw
- Review the agent's decision-making process
- Debug failures by watching agent interactions
- Share results with your team

## ✨ Key Features

| Feature                     | Description                                                                  |
| --------------------------- | ---------------------------------------------------------------------------- |
| 🤖 **Autonomous AI Agents** | Claude-powered agents that understand context and make intelligent decisions |
| 🎬 **Browser Replays**      | Every test generates a reviewable recording via Kernel's replay system       |
| 🔍 **Visual Understanding** | AI agents can "see" and evaluate images, layouts, and visual elements        |
| 📊 **Structured Results**   | Clean PASS/FAIL verdicts with detailed assessment narratives                 |
| ⚡ **Async Execution**      | Non-blocking API calls with polling for efficient testing workflows          |
| 🎯 **Multi-Phase Testing**  | Sequential test phases with independent replay recordings                    |

## 🚨 Important: This is a Template

**⚠️ This is a demonstration template, not a plug-and-play solution.**

This repository showcases the **approach and architecture** for building AI-powered QA systems. To adapt it for your use case, you'll need to:

### What You'll Need to Provide

- ✅ **Kernel Platform Access** - Active account with API access ([sign up](https://www.kernel.sh))
- ✅ **Anthropic API Key** - For Claude AI functionality ([get key](https://console.anthropic.com))
- ✅ **Your Test Environment** - E-commerce site or web application to test (the demo targets [saucedemo.com](https://www.saucedemo.com/), Sauce Labs' public practice store)
- ✅ **Custom Agent Tasks** - Modify the AI instructions for your specific QA scenarios

### What You'll Need to Customize

- 🔧 **Agent Task Instructions** - Current tasks are specific to the saucedemo practice store, including its login step
- 🔧 **Product URLs** - Update to match your test environment
- 🔧 **Validation Logic** - Adapt pass/fail criteria to your requirements
- 🔧 **Expected Behaviors** - Modify based on what you're testing

**Think of this as a blueprint, not a finished product.** The value is in seeing how AI agents, browser automation, and replay recording work together to create autonomous QA workflows.

## 📋 Prerequisites

Before you can run this demo, ensure you have:

1. **Python 3.11+** installed
2. **Kernel CLI** installed and configured ([installation guide](https://www.kernel.sh/docs/reference/cli))
3. **Anthropic API key** with Claude access
4. **UV package manager** (recommended) or pip

No test site setup is needed: the demo runs against [saucedemo.com](https://www.saucedemo.com/), a public practice store. It requires a login, and the demo uses `standard_user` / `secret_sauce`, the practice credentials Sauce Labs publishes on the login page itself.

## 🚀 Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <this-repository>
cd replays-demo
uv sync
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
# For running the demo client
KERNEL_API_KEY=your_kernel_api_key_here

# For deployment (passed to the app via the -e flag)
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 3. Deploy to Kernel

```bash
kernel deploy main.py -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
```

### 4. Run the Demo

```bash
uv run demo-qa-agent.py
```

### 5. Adapt for Your Own Store

To point this at your own site, update the following in `main.py` and `demo-qa-agent.py`:

- Replace the saucedemo URLs with your store URLs
- Replace or remove the saucedemo login step in the Phase 1 agent task
- Customize agent task instructions for your specific QA scenarios
- Update validation criteria for your cart and checkout flows

## 🏗️ Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Demo Client Script                         │
│                    (demo-qa-agent.py)                           │
│                                                                 │
│  • Invokes Kernel app via API                                   │
│  • Polls for completion                                         │
│  • Displays formatted results                                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ API Call
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Kernel Platform                             │
│                   (Managed Browser)                             │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Kernel App (main.py)                        │   │
│  │                                                          │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │  Phase 1: Product Page QA                          │  │   │
│  │  │  • Start replay recording                          │  │   │
│  │  │  • AI Agent logs in and opens product URL          │  │   │
│  │  │  • Evaluate image vs. title match                  │  │   │
│  │  │  • Add item to cart                                │  │   │
│  │  │  • Stop replay → Generate replay link              │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │                         ↓                                │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │  Phase 2: Cart Page QA                             │  │   │
│  │  │  • Start new replay recording                      │  │   │
│  │  │  • AI Agent navigates to cart                      │  │   │
│  │  │  • Verify added item is present                    │  │   │
│  │  │  • Validate cart badge count                       │  │   │
│  │  │  • Stop replay → Generate replay link              │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │                         ↓                                │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │  Return Results                                    │  │   │
│  │  │  • Product assessment + replay link                │  │   │
│  │  │  • Cart assessment + replay link                   │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Core Components

| Component                            | Purpose                                                           | Key Technology                   |
| ------------------------------------ | ----------------------------------------------------------------- | -------------------------------- |
| [main.py](main.py)                   | Kernel app orchestrating the dual-agent QA workflow               | Browser Use SDK, Claude Sonnet 5 |
| [session.py](session.py)             | Custom browser session with a fixed viewport for CDP connections  | Browser Use SDK                  |
| [demo-qa-agent.py](demo-qa-agent.py) | Client script that invokes the app and displays results           | Kernel API, async polling        |

### Technology Stack

- **AI Engine**: Claude Sonnet 5 (`claude-sonnet-5`)
- **Browser Automation**: [Browser Use SDK](https://github.com/browser-use/browser-use) (>=0.13.8)
- **Orchestration**: [Kernel Platform](https://www.kernel.sh) (>=0.96.0)
- **Browser Control**: Chrome DevTools Protocol (via Browser Use)
- **Language**: Python 3.11+

## 🛠️ Customization Guide

### Adapting Agent Tasks

The current agents are configured for specific scenarios. To customize:

1. **Update Product Assessment** (the first `Agent` in main.py):
   - Modify the product evaluation criteria
   - Change expected product types or attributes
   - Adjust the login step and cart addition logic

2. **Update Cart Assessment** (the second `Agent` in main.py):
   - Replace the item and badge checks with your own cart validations
   - Add checks for promotions, totals, or shipping messaging
   - Add additional cart validation steps

3. **Add New Assessment Phases**:
   - Create additional agent instances
   - Add new replay recording phases
   - Update the QAResult structure

## 📺 Example Output

When you run `uv run demo-qa-agent.py`, you'll see formatted results like this:

```
============================================================
🕵️ E-commerce QA Agent Demo
============================================================

🚀 Starting AI-powered quality assurance testing...
📝 Testing URL: https://www.saucedemo.com/inventory-item.html?id=4

⏳ Invoking QA agents... (this may take 2-3 minutes)
⏳ Invocation started (ID: inv_abc123)... polling for completion

============================================================
📊 QA Results
============================================================
⏱️  Completed in 127.3 seconds
🕐 Timestamp: 2025-09-30 14:23:45

📋 Product Page Assessment
----------------------------------------
✅ VERDICT: PASS - The product image clearly shows a backpack which
accurately matches the Sauce Labs Backpack product title. The item
was successfully added to the cart.

📋 Cart Page Assessment
----------------------------------------
✅ VERDICT: PASS - The cart contains the Sauce Labs Backpack added in
the previous step and the cart badge shows 1, matching the cart
contents.

📋 Browser Replay Links
----------------------------------------
Review the AI agent's actions by clicking these replay links:

🎬 Product Page Inspection:
   <replay_view_url returned by the Kernel API>

🎬 Cart Page Inspection:
   <replay_view_url returned by the Kernel API>

============================================================
✨ Demo Complete! 🎉
============================================================
💡 Key Features Demonstrated:
   • AI agents can autonomously navigate websites
   • Automated quality assurance testing
   • Visual replay links for review and debugging
   • Structured assessment reporting
```

> **Note:** Replay view and download URLs are returned in the Kernel API response (e.g. the `replay_view_url` field on the replay object) rather than following a fixed domain pattern. See the [Kernel replays documentation](https://www.kernel.sh/docs/browsers/replays) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.

## 🙏 Acknowledgments

Built with:

- [Kernel](https://www.kernel.sh) - Browser orchestration and replay infrastructure
- [Browser Use](https://github.com/browser-use/browser-use) - AI-powered browser automation
- [Anthropic Claude](https://anthropic.com) - Advanced AI agent intelligence

---

**Ready to build autonomous QA agents?** Start by exploring the code in [main.py](main.py) to see how the dual-phase agent workflow is structured. 🚀
