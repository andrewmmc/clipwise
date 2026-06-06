import { ArrowLeft } from "lucide-react";

interface Props {
  title: string;
  onBack: () => void;
}

export default function EditorHeader({ title, onBack }: Props) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={onBack} className="btn-icon">
        <ArrowLeft size={16} />
      </button>
      <h2 className="text-[13px] font-semibold text-text-primary">{title}</h2>
    </div>
  );
}
