# AGENTS.md

## Project overview

LLM Actions is a macOS menu bar app (Tauri 2) that adds LLM-powered text transformation to the system-wide right-click Services menu. Users configure providers (OpenAI, Anthropic, CLI) and actions (prompt + provider), then select text in any app and apply a transformation.

## Architecture

- **`src/`** — React + TypeScript frontend (Vite, Tailwind CSS v4). Settings UI with tabs for Actions, Providers, and Settings.
- **`src-tauri/`** — Rust backend. Handles config persistence, LLM API calls, CLI subprocess execution, tray icon, and Tauri commands.
- **`swift-plugin/`** — Swift package (`LLMActionsPlugin`) that registers macOS Services entries and handles text replacement via `NSServicesProvider`.

## Key conventions

- **TypeScript**: ESLint flat config (`eslint.config.js`) with `typescript-eslint`, `react-hooks`, `react-refresh`, and `eslint-config-prettier`. Prettier for formatting.
- **Rust**: standard `cargo fmt` / `cargo clippy` conventions.
- **Styling**: Tailwind CSS v4 (utility classes, no component library).
- **State**: React `useState`/`useEffect` — no external state management. Config is loaded from Tauri commands on mount.
- **Testing**: Vitest + Testing Library (frontend), standard Rust tests (backend). All Tauri `invoke` calls are mocked in tests via `vi.mock`.
- **Config file**: `~/Library/Application Support/llm-actions/config.json` — JSON with `providers`, `actions`, `settings`.

## Commands

```bash
npm run lint          # ESLint
npm run format        # Prettier --write
npm run typecheck     # tsc --noEmit
npm test              # Vitest run
npm run build         # tsc + vite build (frontend only)
npm run tauri dev     # Full Tauri dev
npm run tauri build   # Production build
cd src-tauri && cargo test  # Rust tests
```

## Rules

- Keep frontend components in `src/components/`. Follow the existing pattern: one component per file, default export, Props interface.
- Tauri commands are defined in `src-tauri/src/commands/` and invoked from `src/lib/tauri.ts`. Keep the `tauriCommands` object as the single interface layer.
- Types shared between frontend and backend live in `src/types/config.ts` (TS) and `src-tauri/src/models.rs` (Rust) — keep them in sync.
- All LLM responses must return `{"result": "..."}` JSON. The system prompt enforcing this is in `models.rs::SYSTEM_PROMPT` and must not be user-editable.
- Never commit API keys, secrets, or `.env` files.
