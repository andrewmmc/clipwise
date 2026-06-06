import { RotateCcw, Save } from "lucide-react";

interface Props {
  saving?: boolean;
  disabled?: boolean;
  onCancel: () => void;
  onReset: () => void;
}

export default function FormFooter({
  saving = false,
  disabled = false,
  onCancel,
  onReset,
}: Props) {
  const isDisabled = disabled || saving;

  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="btn btn-ghost">
        Cancel
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={isDisabled}
        className="btn btn-secondary"
      >
        <RotateCcw size={14} />
        Reset
      </button>
      <button type="submit" disabled={isDisabled} className="btn btn-primary">
        <Save size={14} />
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
