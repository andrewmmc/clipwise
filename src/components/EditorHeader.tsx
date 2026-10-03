import { ArrowLeft } from "lucide-react";
import { useI18n } from "../lib/i18n";

interface Props {
  title: string;
  onBack: () => void;
}

export default function EditorHeader({ title, onBack }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="btn-icon"
        aria-label={t("Back")}
      >
        <ArrowLeft size={16} />
      </button>
      <h2 className="text-[13px] font-semibold text-text-primary">{title}</h2>
    </div>
  );
}
