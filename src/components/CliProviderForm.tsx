import { Plus, Trash2 } from "lucide-react";
import ErrorBox from "./ErrorBox";
import SuccessBox from "./SuccessBox";

interface Props {
  command: string;
  args: string[];
  fieldClassName: string;
  testingCommand: boolean;
  commandTestError: string | null;
  commandTestSuccess: string | null;
  onCommandChange: (value: string) => void;
  onAddArg: () => void;
  onArgChange: (index: number, value: string) => void;
  onRemoveArg: (index: number) => void;
  onTestCommand: () => void;
}

const CLI_INPUT_PROPS = {
  autoCapitalize: "none" as const,
  autoCorrect: "off" as const,
  spellCheck: false,
};

export default function CliProviderForm({
  command,
  args,
  fieldClassName,
  testingCommand,
  commandTestError,
  commandTestSuccess,
  onCommandChange,
  onAddArg,
  onArgChange,
  onRemoveArg,
  onTestCommand,
}: Props) {
  return (
    <>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-text-secondary">
          Command <span className="text-red-500">*</span>
        </label>
        <p className="mb-1 text-[11px] text-text-tertiary">
          Find the installed binary path with{" "}
          <code className="rounded bg-surface-tertiary px-1 py-0.5 text-text-secondary">
            where claude
          </code>
          ,{" "}
          <code className="rounded bg-surface-tertiary px-1 py-0.5 text-text-secondary">
            where codex
          </code>
          , or{" "}
          <code className="rounded bg-surface-tertiary px-1 py-0.5 text-text-secondary">
            where copilot
          </code>
          .
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={command}
            onChange={(e) => onCommandChange(e.target.value)}
            placeholder="e.g. claude"
            className={`${fieldClassName} flex-1 font-mono`}
            {...CLI_INPUT_PROPS}
          />
          <button
            type="button"
            onClick={onTestCommand}
            disabled={testingCommand}
            className="mac-button-secondary rounded-md px-3 py-2 text-sm disabled:opacity-50"
          >
            {testingCommand ? "Testing…" : "Test Command"}
          </button>
        </div>
        {commandTestError && (
          <ErrorBox message={commandTestError} className="mt-2" />
        )}
        {commandTestSuccess && (
          <div className="mt-2">
            <SuccessBox message={commandTestSuccess} />
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[11px] font-medium text-text-secondary">
            Arguments
          </label>
          <button
            type="button"
            onClick={onAddArg}
            className="flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-strong"
          >
            <Plus size={12} />
            Add arg
          </button>
        </div>
        <p className="mb-2 text-[11px] text-text-tertiary">
          Configure the CLI to run in headless mode so LLM Actions can capture
          the output from stdout. For example,{" "}
          <code className="rounded bg-surface-tertiary px-1 py-0.5 text-text-secondary">
            -p
          </code>
          .
        </p>
        <div className="space-y-2">
          {args.map((arg, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={arg}
                onChange={(e) => onArgChange(index, e.target.value)}
                placeholder="e.g. --print"
                className="mac-input flex-1 rounded-md px-2.5 py-1.5 text-[11px] font-mono"
                {...CLI_INPUT_PROPS}
              />
              <button
                type="button"
                onClick={() => onRemoveArg(index)}
                className="rounded-md p-1.5 text-text-tertiary hover:bg-error/10 hover:text-error"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {args.length === 0 && (
            <p className="text-[11px] text-text-tertiary">
              No arguments. Common: --print -m sonnet
            </p>
          )}
        </div>
      </div>
    </>
  );
}
