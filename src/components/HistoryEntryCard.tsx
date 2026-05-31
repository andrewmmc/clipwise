import { cx } from "../lib/classNames";
import type { HistoryEntry } from "../types/bindings/HistoryEntry";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";

interface Props {
  entry: HistoryEntry;
  expanded: boolean;
  deleting: boolean;
  starring: boolean;
  timestamp: string;
  onToggleExpanded: () => void;
  onToggleStar: () => void;
  onDelete: () => void;
  onCopy: (text: string, label: string) => void;
}

export default function HistoryEntryCard({
  entry,
  expanded,
  deleting,
  starring,
  timestamp,
  onToggleExpanded,
  onToggleStar,
  onDelete,
  onCopy,
}: Props) {
  return (
    <div className="card">
      <div
        onClick={onToggleExpanded}
        className="flex w-full cursor-pointer items-start gap-3 p-3 transition-colors hover:bg-surface-hover"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpanded();
          }
        }}
      >
        <span className="mt-0.5 text-text-tertiary">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {entry.success ? (
              <CheckCircle2 size={14} className="shrink-0 text-success" />
            ) : (
              <XCircle size={14} className="shrink-0 text-error" />
            )}
            <span className="text-[13px] font-medium text-text-primary">
              {entry.actionName}
            </span>
            <span className="text-[12px] text-text-tertiary">
              {entry.providerName}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-text-tertiary">{timestamp}</p>

          {!expanded && (
            <p className="mt-1.5 line-clamp-2 text-[12px] text-text-secondary">
              {entry.inputText}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar();
            }}
            disabled={starring}
            className={cx(
              "btn-icon",
              entry.starred ? "text-warning" : "btn-icon-muted",
            )}
            title={entry.starred ? "Unstar entry" : "Star entry"}
          >
            <Star size={14} className={entry.starred ? "fill-current" : ""} />
          </button>

          {expanded && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={deleting}
              className="btn-icon btn-icon-danger"
              title="Delete entry"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-border p-3">
          <HistoryTextBlock
            label="Input"
            text={entry.inputText}
            onCopy={() => onCopy(entry.inputText, "input")}
          />
          <HistoryTextBlock
            label={entry.success ? "Output" : "Error"}
            text={entry.outputText}
            error={!entry.success}
            onCopy={() =>
              onCopy(entry.outputText, entry.success ? "output" : "error")
            }
          />
        </div>
      )}
    </div>
  );
}

interface HistoryTextBlockProps {
  label: string;
  text: string;
  error?: boolean;
  onCopy: () => void;
}

function HistoryTextBlock({
  label,
  text,
  error,
  onCopy,
}: HistoryTextBlockProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12px] font-medium text-text-secondary">
          {label}
        </span>
        <button type="button" onClick={onCopy} className="btn btn-ghost">
          <Copy size={14} />
          Copy
        </button>
      </div>
      <pre
        className={cx(
          "whitespace-pre-wrap break-words rounded-md border p-2 text-[12px] font-mono",
          error
            ? "feedback-error"
            : "border-border bg-surface-tertiary text-text-secondary",
        )}
      >
        {text}
      </pre>
    </div>
  );
}
