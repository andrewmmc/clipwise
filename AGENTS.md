# AGENTS.md

## Project overview

Clipwise is a macOS menu bar app (Tauri 2) that adds LLM-powered text transformation via the system tray. On supported Macs, the app auto-attaches an Apple Intelligence provider at startup; users can also configure OpenAI, Anthropic, and CLI providers plus custom actions. Users copy text, select an action from the tray menu, and the transformed result is written back to the clipboard.

## Architecture

- **`src/`** — React + TypeScript frontend (Vite, Tailwind CSS v4). Settings UI with tabs for Actions, Providers, and Settings.
- **`src-tauri/`** — Rust backend. Handles config persistence, LLM API calls, CLI subprocess execution, tray icon, and Tauri commands.

## Key conventions

- **TypeScript**: ESLint flat config (`eslint.config.js`) with `typescript-eslint`, `react-hooks`, `react-refresh`, and `eslint-config-prettier`. Prettier for formatting.
- **Rust**: standard `cargo fmt` / `cargo clippy` conventions.
- **Styling**: Tailwind CSS v4 (utility classes, no component library).
- **State**: React `useState`/`useEffect` — no external state management. Config is loaded from Tauri commands on mount.
- **Testing**: Vitest + Testing Library (frontend), standard Rust tests (backend). All Tauri `invoke` calls are mocked in tests via `vi.mock`.
- **Config file**: `~/Library/Application Support/clipwise/config.json` — JSON with `providers`, `actions`, `settings`.

## Commands

```bash
npm run lint          # ESLint
npm run format        # Prettier --write
npm run typecheck     # tsc --noEmit
npm test              # Vitest run
npm run build         # tsc + vite build (frontend only)
npm run tauri:dev     # Full Tauri dev
npm run tauri:build   # Production build
npm run tauri:build-debug  # Debug .app bundle
cd src-tauri && cargo test  # Rust tests
```

## Rules

- Keep frontend components in `src/components/`. Follow the existing pattern: one component per file, default export, Props interface.
- Tauri commands are defined in `src-tauri/src/commands/` and invoked from `src/lib/tauri.ts`. Keep the `tauriCommands` object as the single interface layer.
- Types shared between frontend and backend live in `src/types/config.ts` (TS) and `src-tauri/src/models.rs` (Rust) — keep them in sync.
- All LLM responses must return `{"result": "..."}` JSON. The system prompt enforcing this is in `models.rs::SYSTEM_PROMPT` and must not be user-editable.
- Never commit API keys, secrets, or `.env` files.
- Never use interactive git commands. For tags, always use `-m` to provide a message inline (e.g., `git tag -a v1.0.0 -m "v1.0.0"`).

## Cursor Cloud specific instructions

This is a macOS-native Tauri 2 desktop app. On Linux cloud VMs:

- **Frontend (React/TS)** works fully: lint, typecheck, test, build all run as documented in the Commands section above.
- **Rust backend tests** work fully on Linux (`cd src-tauri && cargo test`). Requires `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, and `libjavascriptcoregtk-4.1-dev` system packages to compile.
- **`npx tauri dev`** compiles and launches on Linux (macOS-specific code is `#[cfg]`-gated). The Rust backend, tray icon, and Vite dev server all start successfully. However, the **WebKitGTK webview renders as transparent** on the cloud VM due to missing GPU/DRI3 acceleration — even with `WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1`. To develop the frontend UI, open `http://localhost:1420` in Chrome instead while `tauri dev` is running.
- **`npm run tauri:build`** also compiles on Linux but produces a Linux bundle (not macOS `.app`).
- **Vite dev server** (`npm run dev` or auto-started by `tauri dev`) serves the frontend on port 1420. When accessed in Chrome, the UI shows a "Failed to load config" error because the Tauri `invoke` bridge is unavailable outside the native webview — this is expected and not a bug.
- The `prepare` script runs `lefthook install`, which may conflict with the agent's `core.hooksPath` git config. Use `npm install --ignore-scripts` if `npm install` fails on the prepare step, then run checks manually.
- **Rust toolchain**: crate dependencies require Rust 1.85+ (edition 2024). Run `rustup default stable` if the default toolchain is too old.
