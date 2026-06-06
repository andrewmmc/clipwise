import { useState } from "react";
import { cx } from "../lib/classNames";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  XCircle,
  Loader2,
} from "lucide-react";

export interface RunResult {
  id: string;
  actionName: string;
  inputText: string;
  outputText: string;
  success: boolean;
  pending: boolean;
}

interface Props {
  result: RunResult;
}

export default function RunResultCard({ result }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.outputText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex w-full items-center gap-3 px-3 py-2.5">
        {result.pending ? (
          <span className="text-text-tertiary">
            <Loader2 size={14} className="animate-spin" />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="btn-icon p-0 text-text-tertiary"
            aria-label={expanded ? "Collapse result" : "Expand result"}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {result.pending ? (
              <span className="text-[13px] font-medium text-accent">
                Running…
              </span>
            ) : result.success ? (
              <CheckCircle2 size={14} className="shrink-0 text-success" />
            ) : (
              <XCircle size={14} className="shrink-0 text-error" />
            )}
            <span className="text-[13px] font-medium text-text-primary">
              {result.actionName}
            </span>
          </div>
        </div>

        {!result.pending && result.success && (
          <button
            type="button"
            onClick={handleCopy}
            className="btn btn-ghost py-1 text-[12px]"
            title="Copy output"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>

      {expanded && !result.pending && (
        <div className="border-t border-border px-3 py-2.5">
          <pre
            className={cx(
              "whitespace-pre-wrap break-words rounded-md border p-2.5 text-[12px] font-mono leading-relaxed",
              "select-text",
              result.success
                ? "border-border bg-surface-tertiary text-text-secondary"
                : "feedback-error",
            )}
          >
            {result.outputText}
          </pre>
        </div>
      )}
    </div>
  );
}
