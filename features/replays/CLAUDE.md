# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Kernel application that demonstrates automated QA testing for e-commerce websites using Browser Use SDK and AI agents. The application performs quality assurance checks on https://www.saucedemo.com/ (Sauce Labs' public practice store), evaluating product page accuracy and cart contents, then generates browser replay links for review.

## Common Commands

**Install dependencies:**

```bash
uv sync  # preferred package manager
# or: pip install -e .
```

**Deploy to Kernel:**

```bash
kernel deploy main.py -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
```

**Run demo client:**

```bash
uv run demo-qa-agent.py
```

**Required environment variables:**

- `ANTHROPIC_API_KEY` - Claude API key for AI agents (passed at deploy time)
- `KERNEL_API_KEY` - Required for demo script API calls

## Key Components

- **main.py**: Core Kernel app with `storefront-qa-agent` action that orchestrates the two-phase QA testing workflow
- **session.py**: Custom browser session class (`BrowserSessionCustomResize`) that provides proper viewport handling and window resizing when connecting via CDP
- **demo-qa-agent.py**: Standalone demo script that invokes the Kernel app via API and displays formatted results
- **pyproject.toml**: Project configuration with dependencies for browser-use, kernel, anthropic, and supporting libraries

## Architecture

The application implements a dual-agent QA approach:

### Phase 1: Product Page Assessment

- AI agent logs in to saucedemo with the published practice credentials (standard_user / secret_sauce)
- Navigates to the specified product URL
- Examines product image vs title description for accuracy
- Adds item to cart
- Returns PASS/FAIL verdict with assessment text

### Phase 2: Cart Page Assessment

- AI agent navigates to cart page via UI
- Verifies the item added in Phase 1 is present
- Validates the cart badge count matches the cart contents
- Returns PASS/FAIL verdict with assessment text

Each phase records a separate browser replay for detailed review.

## Dependencies

- **browser-use** (>=0.13.8): Browser automation framework with AI agent capabilities
- **kernel** (>=0.96.0): Kernel platform SDK for deployment and browser management
- **anthropic** (>=0.40.0): Claude AI integration for intelligent agents
- **pydantic** (>=2.10.6): Data validation and structured return types
- **requests** (>=2.25.1): HTTP client for API calls
- **python-dotenv** (>=0.19.0): Environment variable management

## Technical Implementation Details

### AI Model Configuration

- Uses Claude Sonnet 5 (`claude-sonnet-5`) for intelligent browser automation
- Agents receive structured task instructions with specific output format requirements
- Plain text responses enforced (no markdown formatting)

### Browser Session Management

- Fixed 1024x786 viewport configuration across all browser contexts
- Custom `BrowserSessionCustomResize` class in `session.py` passes the fixed viewport/window size through to `BrowserSession` (browser-use >= 0.13 handles CDP viewport sizing natively)
- Proper browser session cleanup in finally blocks to prevent resource leaks

### Kernel Replays Integration

- Sequential replay recording: product phase → cart phase
- Replay view URLs provided in structured response for user review

### Credentials

- The saucedemo login (standard_user / secret_sauce) is a published practice credential, safe to hardcode as a demo default
- API keys are supplied via environment variables at deploy time, never in source code

### Error Handling

- Comprehensive try/catch blocks around replay operations
- Graceful degradation when agent tasks fail
- Structured error messaging in assessment results
- Guaranteed browser session cleanup

## Data Structures

### TaskInput

```python
class TaskInput(TypedDict):
    product_url: str
```

### QAResult

```python
class QAResult(TypedDict):
    product_page_replay_link: str
    cart_page_replay_link: str
    product_image_assessment: str
    cart_assessment: str
```

## Demo Application Features

The `demo-qa-agent.py` provides:

- Async Kernel app invocation with polling
- Formatted console output with colored verdicts
- Structured result display with replay links
- Execution timing and error handling
- User-friendly troubleshooting guidance

## QA Agent Design Patterns

For effective QA automation:

- Separate browser replays for distinct testing phases
- Structured agent task descriptions with explicit output format requirements
- Comprehensive error handling for both browser and agent failures
- TypedDict return structures for API consistency
- API keys supplied via environment variables, never hardcoded
