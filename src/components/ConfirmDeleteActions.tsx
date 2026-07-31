interface Props {
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
}

export default function ConfirmDeleteActions({
  onConfirm,
  onCancel,
  confirmLabel = "Delete",
}: Props) {
  return (
    <>
      <button
        type="button"
        onClick={onConfirm}
        className="btn btn-danger px-2 py-1 text-[12px]"
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="btn btn-ghost px-2 py-1 text-[12px]"
      >
        Cancel
      </button>
    </>
  );
}
