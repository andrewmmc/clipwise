export default function AboutPanel() {
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="space-y-1 text-[12px] text-text-secondary">
          <p>
            <strong>LLM Actions</strong> v0.1.0
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
