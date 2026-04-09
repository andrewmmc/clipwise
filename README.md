# LLM Actions

LLM Actions is a macOS menu bar app for running text transformations with LLMs. You configure providers and actions in a Tauri settings window, then trigger actions from the tray menu against the current clipboard text.

The app is built with Tauri 2, a React + TypeScript frontend, and a Rust backend. A Swift package for macOS Services is also included in the repository for native Services-related work.

## Current behavior

- Runs as a menu bar app with `ActivationPolicy::Accessory` and no Dock presence
- Opens a settings window for managing providers, actions, and app settings
- Builds the tray menu dynamically from configured actions
- Reads text from the clipboard, runs the selected action, and writes the result back to the clipboard
- Optionally shows a macOS notification when the action completes
- Supports action testing from the settings UI before using the tray flow

## Providers

- `anthropic`: direct Anthropic API requests
- `openai`: OpenAI-compatible chat completion endpoints
- `cli`: local CLI commands such as `claude` or `codex`

Provider config supports:

- shared fields: `name`, `type`
- API providers: `endpoint`, `apiKey`, `headers`, `defaultModel`
- CLI providers: `command`, `args`

All LLM responses are normalized to a JSON object containing a top-level `result` string.

## Architecture

```text
src/               React + TypeScript settings UI (Vite, Tailwind CSS v4)
src-tauri/         Rust backend, tray app, config persistence, provider calls
swift-plugin/      Swift package for macOS Services integration experiments/work
```

Important frontend areas:

- `src/components/ActionList.tsx`: action management and test-run UI
- `src/components/ProviderList.tsx`: provider management
- `src/components/Settings.tsx`: notification and max token settings
- `src/lib/tauri.ts`: single frontend interface for Tauri commands

Important backend areas:

- `src-tauri/src/lib.rs`: app bootstrap, tray setup, clipboard execution flow
- `src-tauri/src/commands/config_cmd.rs`: config CRUD and action reorder
- `src-tauri/src/commands/llm_cmd.rs`: action execution and test execution
- `src-tauri/src/commands/validate_cmd.rs`: response validation/normalization
- `src-tauri/src/providers/`: Anthropic, OpenAI-compatible, and CLI provider implementations

## Configuration

Config is stored at:

```text
~/Library/Application Support/llm-actions/config.json
```

Current top-level shape:

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

## Requirements

- macOS
- Node.js 22+
- Rust stable
- Xcode Command Line Tools

## Development

Install dependencies:

```bash
npm install
```

Start the full app in development mode:

```bash
npm run tauri:dev
```

If you only need the frontend:

```bash
npm run dev
```

## Scripts

| Script                      | Description                                   |
| --------------------------- | --------------------------------------------- |
| `npm run dev`               | Start the Vite dev server only                |
| `npm run build`             | Run `tsc` and build the frontend with Vite    |
| `npm run preview`           | Preview the frontend build                    |
| `npm run tauri:dev`         | Start the full Tauri app in development mode  |
| `npm run tauri:build`       | Build the production Tauri app                |
| `npm run tauri:build-debug` | Build a debug `.app` bundle for local testing |
| `npm run lint`              | Run ESLint                                    |
| `npm run lint:fix`          | Run ESLint with autofixes                     |
| `npm run format`            | Format the repository with Prettier           |
| `npm run format:check`      | Check formatting with Prettier                |
| `npm run typecheck`         | Run `tsc --noEmit`                            |
| `npm test`                  | Run Vitest once                               |
| `npm run test:watch`        | Run Vitest in watch mode                      |

## Testing

Frontend tests use Vitest and Testing Library:

```bash
npm test
```

Rust tests:

```bash
cd src-tauri && cargo test
```

Useful local verification commands:

```bash
npm run lint
npm run typecheck
npm run format:check
```

## Building

Production build:

```bash
npm run tauri:build
```

Debug app bundle:

```bash
npm run tauri:build-debug
```

The debug app bundle is written to:

```text
src-tauri/target/debug/bundle/macos/LLM Actions.app
```

## CI

GitHub Actions runs on push and pull request for `master` and checks:

- lint
- prettier
- typecheck
- test
- frontend build

## Notes on macOS Services

The repository includes `swift-plugin/` with a native `LLMActionsPlugin` Swift package and `ServiceHandler.swift` for macOS Services integration. The active Tauri app flow in `src-tauri/src/lib.rs` is currently tray + clipboard based, so the README documents that runtime behavior first.

## License

Private. All rights reserved.
