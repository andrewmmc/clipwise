interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDeleteActions({ onConfirm, onCancel }: Props) {
  return (
    <>
      <button
        type="button"
        onClick={onConfirm}
        className="btn btn-danger px-2 py-1 text-[12px]"
      >
        Delete
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
