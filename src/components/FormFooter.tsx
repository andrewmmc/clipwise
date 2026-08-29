import { RotateCcw, Save } from "lucide-react";
import { useI18n } from "../lib/i18n";

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
  const { t } = useI18n();
  const isDisabled = disabled || saving;

  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="btn btn-ghost">
        {t("Cancel")}
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={isDisabled}
        className="btn btn-secondary"
      >
        <RotateCcw size={14} />
        {t("Reset")}
      </button>
      <button type="submit" disabled={isDisabled} className="btn btn-primary">
        <Save size={14} />
        {saving ? t("Saving…") : t("Save")}
      </button>
    </div>
  );
}
