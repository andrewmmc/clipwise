import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { tauriCommands } from "../lib/tauri";
import type { AppInfo } from "../types/config";

export default function AboutPanel() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [cliEnabled, setCliEnabled] = useState(true);

  useEffect(() => {
    tauriCommands.getAppInfo().then(setAppInfo).catch(console.error);
    tauriCommands
      .isCliProviderEnabled()
      .then(setCliEnabled)
      .catch(() => setCliEnabled(false));
  }, []);

  const versionString = appInfo
    ? `v${appInfo.version}${appInfo.commit_hash ? ` (${appInfo.commit_hash})` : ""}`
    : "...";

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <img
            src="/app-icon.png"
            alt="Clipwise"
            className="h-14 w-14 rounded-xl"
          />
          <div className="space-y-1 text-[12px] text-text-secondary">
            <p>
              <strong>Clipwise</strong> {versionString}
            </p>
            <p>
              macOS text transformation via LLM APIs
              {cliEnabled && <> &amp; CLI tools</>}.
            </p>
            {!cliEnabled && (
              <p className="text-text-tertiary">Mac App Store version</p>
            )}
          </div>
        </div>
        <p className="mt-2 text-[12px] text-text-tertiary">
          Copy text, open the menu bar icon, choose an action. The result is
          copied to your clipboard.
        </p>
        <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => openUrl("https://clipwise.mmc.dev")}
            className="btn btn-secondary text-[12px]"
          >
            Website
          </button>
          <button
            type="button"
            onClick={() => openUrl("https://github.com/andrewmmc/clipwise")}
            className="btn btn-secondary text-[12px]"
          >
            GitHub
          </button>
        </div>
        <div className="mt-2 flex items-center gap-3 text-[11px]">
          <button
            type="button"
            onClick={() => openUrl("https://clipwise.mmc.dev/privacy")}
            className="cursor-pointer text-text-tertiary underline hover:text-text-secondary"
          >
            Privacy Policy
          </button>
        </div>
      </div>

      <p className="text-center text-[11px] text-text-tertiary">
        © 2026{" "}
        <button
          type="button"
          onClick={() => openUrl("https://andrewmmc.com/")}
          className="cursor-pointer underline hover:text-text-secondary"
        >
          Andrew Mok
        </button>
      </p>
    </div>
  );
}
