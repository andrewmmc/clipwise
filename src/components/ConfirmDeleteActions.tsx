import { useI18n } from "../lib/i18n";

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
}

export default function ConfirmDeleteActions({
  onConfirm,
  onCancel,
  confirmLabel,
}: Props) {
  const { t } = useI18n();
  return (
    <>
      <button
        type="button"
        onClick={onConfirm}
        className="btn btn-danger px-2 py-1 text-[12px]"
      >
        {confirmLabel ?? t("Delete")}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="btn btn-ghost px-2 py-1 text-[12px]"
      >
        {t("Cancel")}
      </button>
    </>
  );
}
