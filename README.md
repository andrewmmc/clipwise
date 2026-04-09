# ⚡ LLM Actions

A macOS menu bar app that adds LLM-powered text transformation actions to the right-click Services menu. Select text in any app, trigger an action, and get it transformed in-place.

Built with [Tauri 2](https://tauri.app/) (Rust backend) + React + TypeScript frontend, with a Swift plugin for macOS Services integration.

## Features

- **Services menu integration** — actions appear in the right-click context menu system-wide
- **Multiple providers** — OpenAI-compatible APIs, Anthropic API, or CLI tools (e.g. `claude --print`)
- **Custom actions** — define prompts like "Fix grammar", "Translate to Japanese", "Summarize", etc.
- **Menu bar app** — runs as a tray icon with no Dock presence
- **macOS notifications** on completion (optional)

## Architecture

```
src/               React + TypeScript frontend (Vite, Tailwind CSS v4)
src-tauri/         Rust backend (Tauri 2) — config, LLM providers, commands
swift-plugin/      Swift package for macOS Services registration
```

- **Config** stored at `~/Library/Application Support/llm-actions/config.json`
- **Providers**: OpenAI, Anthropic (API-based), or CLI (spawns a subprocess)
- **Actions**: each maps a user prompt + provider to a Services menu entry

## Prerequisites

- macOS 13+
- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 22+
- Xcode Command Line Tools

## Development

```bash
npm install
npm run tauri dev
```

### Available scripts

| Script                | Description                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run tauri dev`   | **Start the app in development mode** (frontend + Rust backend). Use this for local development. |
| `npm run tauri build` | Production build                                                                                 |
| `npm run dev`         | Start Vite dev server only (⚠️ frontend won't work without the Tauri backend)                    |
| `npm run build`       | TypeScript check + Vite build (frontend only)                                                    |
| `npm run lint`        | Run ESLint                                                                                       |
| `npm run lint:fix`    | Run ESLint with auto-fix                                                                         |
| `npm run format`      | Format all files with Prettier                                                                   |
| `npm run typecheck`   | Run `tsc --noEmit`                                                                               |
| `npm test`            | Run tests (Vitest)                                                                               |
| `npm run test:watch`  | Run tests in watch mode                                                                          |

### Git hooks

[Lefthook](https://github.com/evilmartians/lefthook) runs on pre-commit:

- ESLint on staged `.ts`/`.tsx` files
- Prettier check on staged files
- TypeScript type checking

### CI

GitHub Actions runs on push/PR to `main`: lint → prettier → typecheck → test → build.

## Build

```bash
npm run tauri build
```

Produces a `.app` bundle and `.dmg` in `src-tauri/target/release/bundle/`.

### Debug build (for testing macOS Services)

macOS only registers Services from installed `.app` bundles — they don't appear when running `npm run tauri dev`. Use a debug build to test Services integration without a full release build:

```bash
npm run tauri build -- --debug
```

Open the app from `src-tauri/target/debug/bundle/macos/`. To force macOS to refresh the Services menu after installing:

```bash
/System/Library/CoreServices/pbs -update
```

## License

Private — all rights reserved.
