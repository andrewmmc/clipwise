import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { tauriCommands } from "../lib/tauri";
import type { Action } from "../types/config";

type Status = "idle" | "running" | "error";

export default function Picker() {
  const [actions, setActions] = useState<Action[]>([]);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  // Load config + pending text whenever the window becomes visible.
  useEffect(() => {
    const load = async () => {
      setStatus("idle");
      setErrorMsg(null);
      setRunningId(null);
      try {
        const [config, text] = await Promise.all([
          tauriCommands.getConfig(),
          tauriCommands.getPendingText(),
        ]);
        setActions(config.actions);
        setPendingText(text);
      } catch (e) {
        setStatus("error");
        setErrorMsg(String(e));
      }
    };

    // Load immediately on mount (window is shown before React mounts).
    load();

    // Also reload when the window is focused again after being hidden.
    const win = getCurrentWindow();
    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      if (focused) load();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const dismiss = async () => {
    setPendingText(null);
    setStatus("idle");
    setErrorMsg(null);
    setRunningId(null);
    await getCurrentWindow().hide();
  };

  // Dismiss on Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleAction = async (action: Action) => {
    if (!pendingText || status === "running") return;
    setStatus("running");
    setRunningId(action.id);
    setErrorMsg(null);
    try {
      await tauriCommands.runAndPaste(action.id, pendingText);
      await dismiss();
    } catch (e) {
      setStatus("error");
      setErrorMsg(String(e));
      setRunningId(null);
    }
  };

  const noText = pendingText === null;

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <span className="text-sm font-semibold text-gray-800">
          Transform Text
        </span>
        <button
          onClick={dismiss}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Cancel"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3">
        {status === "error" && errorMsg && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        {noText && status !== "error" && (
          <p className="py-8 text-center text-sm text-gray-400">
            No text to transform.
          </p>
        )}

        {!noText && actions.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">
            No actions configured. Open Settings to add one.
          </p>
        )}

        {!noText && actions.length > 0 && (
          <ul className="space-y-1.5">
            {actions.map((action) => {
              const isRunning = runningId === action.id;
              return (
                <li key={action.id}>
                  <button
                    onClick={() => handleAction(action)}
                    disabled={status === "running"}
                    className={[
                      "w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                      status === "running"
                        ? isRunning
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400"
                        : "border-gray-200 bg-white text-gray-800 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700",
                    ].join(" ")}
                  >
                    <span className="flex items-center gap-2">
                      {isRunning && (
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                      )}
                      {action.name}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer hint */}
      <div className="border-t border-gray-100 px-4 py-2 text-center text-xs text-gray-400">
        Press Esc to cancel
      </div>
    </div>
  );
}
