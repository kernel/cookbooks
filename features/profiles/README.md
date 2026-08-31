# Kernel Profile-Based Browser Automation Demo

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)

This TypeScript application demonstrates how to use Kernel's profile-based browser automation system for persistent authentication and task execution across browser sessions.

[![Kernel Profiles Youtube Video Screenshot](https://github.com/user-attachments/assets/2238004a-7684-42b2-814c-c68a56d94706)](https://www.youtube.com/watch?v=KG450vlHcUc)

## Overview

This demo showcases Kernel's browser profile capabilities, allowing you to:

- Create persistent browser profiles that maintain authentication state
- Execute automated tasks using pre-authenticated profiles
- Manage browser sessions programmatically with proper cleanup

The application combines [Kernel SDK](https://github.com/onkernel/kernel-node-sdk) for browser orchestration with [Magnitude](https://docs.magnitude.run/getting-started/introduction) for LLM-powered browser automation.

## Features

### 🔐 Persistent Authentication

Create browser profiles that save authentication state (cookies, local storage, etc.) for reuse across sessions

### 🤖 AI-Powered Automation

Execute natural language tasks on authenticated websites using Claude's capabilities with optional data extraction

### 🛡️ Stealth Mode

Built-in residential proxy and auto-CAPTCHA solving for reliable automation

### 🎯 Profile Management

Efficiently manage multiple browser profiles for different accounts or use cases

## Prerequisites

- Node.js and pnpm
- Kernel CLI installed
- [Kernel MCP Server](https://www.kernel.sh/docs/reference/mcp-server) configured (for MCP client integration)
- Anthropic API key for LLM-powered automation

## Installation

```bash
# Install dependencies
pnpm install
```

## Configuration

Create a `.env` file with your Anthropic API key:

```env
ANTHROPIC_API_KEY=your_api_key_here
```

## Deploy Kernel App

Deploy the application to Kernel:

```bash
kernel deploy index.ts --env-file .env
```

## 🔌 MCP Integration

This repository is designed to work seamlessly with MCP (Model Context Protocol) clients via [Kernel's MCP server](https://www.kernel.sh/docs/reference/mcp-server). When connected through MCP, you can execute browser automation tasks using natural language on authenticated browser sessions with saved profiles. This enables powerful workflows where AI assistants can interact with authenticated web services on your behalf while maintaining security through isolated browser profiles.

**Key Benefits with MCP:**

- Execute natural language commands directly on authenticated sessions
- Maintain persistent authentication across multiple task executions
- Seamlessly integrate browser automation into AI workflows
- Secure profile isolation ensures data safety

### 📝 MCP Client Integration Guide

When using this app through an MCP client (like Claude or Cursor), follow this workflow:

1. **Start by discovering the Actions' payload schemas:**

   Tell your MCP client:

   ```
   Using my Kernel app called profile-auth-and-task-execution, invoke the get-payload-schemas action so you know the payload schema for all available actions
   ```

   This will return the complete parameter requirements for all actions, allowing your MCP client to understand what parameters each action needs.

2. **Create a browser profile for authentication:**

   ```
   Invoke the create-profile-browser action to create a new browser session with a profile
   ```

   Use the returned browser URL to manually authenticate with your desired service.

3. **Save the authenticated profile:**

   ```
   Invoke the end-session-and-save-profile action with the session_id I just received
   ```

4. **Execute tasks with the authenticated profile:**
   ```
   Invoke the execute-task-with-profile action using the profile_name from earlier, with the task: [your task here]
   ```

This natural language approach makes it easy to interact with authenticated web services through your MCP client.

## Usage

The application provides four main actions:

### 1. Create Profile Browser

Creates a new browser instance with a persistent profile for authentication:

```bash
kernel invoke profile-auth-and-task-execution create-profile-browser
```

**Returns:**

- `browser_live_view_url`: URL to access the browser for manual authentication
- `profile_name`: Generated unique profile identifier
- `session_id`: Browser session ID for management

**What it does:**

- Generates a unique profile name (e.g., `profile_1234567890_abc123`)
- Creates a new browser with `save_changes: true` to persist authentication
- Provides a live view URL where you can manually log into websites
- Saves all authentication data when the session ends

### 2. End Session and Save Profile

Terminates a browser session and saves the profile state:

```bash
kernel invoke profile-auth-and-task-execution end-session-and-save-profile \
  --payload '{"session_id": "your_session_id"}'
```

**Parameters:**

- `session_id`: The browser session ID to terminate

**Returns:**

- `success`: Boolean indicating if the session was ended successfully

### 3. Execute Task with Profile

Executes automated tasks using an existing profile with pre-loaded authentication:

```bash
kernel invoke profile-auth-and-task-execution execute-task-with-profile \
  --payload '{
    "profile_name": "profile_1234567890_abc123",
    "task": "Go to ign.com and get the latest news stories",
    "url": "https://ign.com",
    "extract_instructions": "Extract the main headlines, article summaries, and any author information"
  }'
```

**Parameters:**

- `profile_name`: The profile to use (from step 1)
- `task`: Natural language description of the task to execute
- `url` (optional): Starting URL for the browser
- `extract_instructions` (optional): Natural language instructions for extracting structured data after task completion

**Returns:**

- `success`: Boolean indicating task completion
- `task_result`: Result from the executed task
- `extracted_data` (optional): Structured data extracted after task completion based on your instructions
- `session_id`: Browser session ID
- `error`: Error message if task failed

**What it does:**

- Creates a new browser with the existing profile (`save_changes: false`)
- Loads all saved authentication from the profile
- Uses Magnitude with Claude to execute the natural language task
- Optionally extracts structured data after task completion using AI
- Properly cleans up the browser session after completion

### 4. Get Payload Schemas

Returns the expected payload format for each action to help LLMs understand the API:

```bash
kernel invoke profile-auth-and-task-execution get-payload-schemas
```

**Returns:**

- An object mapping action names to their payload schemas
- Each schema includes field types, requirements, and descriptions
- Useful for dynamic API discovery and integration

**Example Response:**

```json
{
  "create-profile-browser": {
    "description": "Creates a new browser with a persistent profile for authentication",
    "payload": null
  },
  "end-session-and-save-profile": {
    "description": "Ends a browser session and saves the profile state",
    "payload": {
      "session_id": {
        "type": "string",
        "required": true,
        "description": "The browser session ID to terminate"
      }
    }
  }
  // ... other actions
}
```

## Architecture

### Core Components

- **Kernel SDK** (`@onkernel/sdk`): Manages browser instances, profiles, and invocations
- **Magnitude Core** (`magnitude-core`): Provides browser automation with LLM integration
- **Profile System**: Persists authentication across sessions using named profiles
- **Stealth Features**: Residential proxy and CAPTCHA solving for reliable automation

### How Profiles Work

1. **Profile Creation**: When creating a browser with `save_changes: true`, all browser state (cookies, local storage, session data) is saved to the profile upon session termination
2. **Profile Reuse**: Loading a profile with `save_changes: false` restores all saved state but doesn't modify the original profile
3. **State Persistence**: Profiles maintain authentication indefinitely until explicitly deleted or sessions expire

## Security Considerations

- Never commit your `.env` file (already in `.gitignore`)
- API keys are validated before task execution
- Browser sessions are properly terminated to prevent resource leaks
- Profiles are isolated and cannot access other profiles' data

## Documentation

- [Kernel Browsers Documentation](https://www.kernel.sh/docs/auth/profiles)
- [Kernel SDK Reference](https://www.kernel.sh/docs)
- [Magnitude Framework](https://docs.magnitude.run/getting-started/introduction)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.

## Support

For issues or questions about:

- Kernel platform: Visit [kernel.sh](https://www.kernel.sh)
- This demo: Open an issue in this repository
