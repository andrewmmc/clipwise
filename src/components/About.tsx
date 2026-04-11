import { useEffect, useState } from "react";
import { tauriCommands } from "../lib/tauri";
import type { AppInfo } from "../types/config";

export default function AboutPanel() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    tauriCommands.getAppInfo().then(setAppInfo).catch(console.error);
  }, []);

  const versionString = appInfo
    ? `v${appInfo.version}${appInfo.commit_hash ? ` (${appInfo.commit_hash})` : ""}`
    : "...";

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="space-y-1 text-[12px] text-text-secondary">
          <p>
            <strong>Clipwise</strong> {versionString}
          </p>
          <p>macOS text transformation via LLM APIs &amp; CLI tools.</p>
          <p className="mt-2 text-text-tertiary">
            Copy text, open the menu bar icon, choose an action. The result is
            copied to your clipboard.
          </p>
        </div>
      </div>

      <p className="text-center text-[11px] text-text-tertiary">
        © 2026 Andrew Mok
      </p>
    </div>
  );
}
