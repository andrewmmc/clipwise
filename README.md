<h1 align="center">LLM Actions</h1>

<p align="center">
  <strong>macOS menu bar app for LLM-powered text transformations.</strong>
</p>

<p align="center">
  <a href="https://github.com/andrewmmc/llm-actions/actions/workflows/ci.yml">
    <img alt="CI" src="https://github.com/andrewmmc/llm-actions/actions/workflows/ci.yml/badge.svg" />
  </a>
</p>

LLM Actions adds LLM-powered text transformations to your macOS workflow. Configure providers (OpenAI, Anthropic, CLI) and custom actions, then trigger them from the menu bar against clipboard text.

No browser. No context switching. Select text, run an action, get the result back in your clipboard.

## Why LLM Actions

- **System-wide access** — trigger actions from the menu bar in any app without switching context
- **Multi-provider support** — OpenAI, Anthropic, and any OpenAI-compatible endpoint, plus local CLI tools like `claude` or `codex`
- **Custom actions** — define reusable prompt + provider combinations for your specific workflows
- **Local-first** — no backend, no telemetry; API keys and config stay on your machine

## Features

- **Menu bar app** — runs as a tray app with no Dock presence
- **Settings UI** — manage providers, actions, and app settings from a dedicated window
- **Clipboard workflow** — reads text from clipboard, runs the action, writes result back
- **Action testing** — test actions directly in the settings UI before using them
- **Notifications** — optional macOS notifications when actions complete
- **Reorderable actions** — drag to reorder actions in the menu

## Providers

- **Anthropic** — direct Anthropic API requests
- **OpenAI** — OpenAI-compatible chat completion endpoints (works with OpenAI, OpenRouter, local models, etc.)
- **CLI** — local CLI commands like `claude`, `codex`, or custom scripts

## Development

> **Note:** This section is for contributors and developers only.

### Prerequisites

- macOS
- Node.js 22+
- [Rust](https://www.rust-lang.org/tools/install)
- Xcode Command Line Tools

### Quick start

```bash
npm install
npm run tauri:dev    # full Tauri app
```

### Commands

```bash
npm run dev          # Vite dev server only
npm run build        # tsc + Vite build
npm run tauri:dev    # full Tauri app (dev)
npm run tauri:build  # production build
npm run tauri:build-debug  # debug .app bundle
npm run lint         # ESLint
npm run typecheck    # TypeScript check
npm run format       # Prettier
npm test             # Vitest
cd src-tauri && cargo test  # Rust tests
```

### Testing macOS Services

macOS Services integration requires a built `.app` bundle:

```bash
npm run tauri:build-debug
# Output: src-tauri/target/debug/bundle/macos/LLM Actions.app
```

### Tech stack

React 19, TypeScript, Vite 7, Tailwind CSS v4, Tauri 2, Vitest.

See **[AGENTS.md](./AGENTS.md)** for architecture, conventions, and contributor docs.

## Architecture

```text
src/           React + TypeScript settings UI (Vite, Tailwind CSS v4)
src-tauri/     Rust backend: tray app, config persistence, provider calls
swift-plugin/  Swift package for macOS Services integration
```

## Configuration

Config is stored at `~/Library/Application Support/llm-actions/config.json`:

```json
{
  "providers": [],
  "actions": [],
  "settings": {
    "showNotificationOnComplete": true,
    "maxTokens": 4096
  }
}
```

## Author

Created by **Andrew Mok** ([@andrewmmc](https://github.com/andrewmmc))

## License

Private. All rights reserved.
