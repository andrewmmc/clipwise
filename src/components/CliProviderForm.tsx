import { Plus, Trash2 } from "lucide-react";
import { buildCommandPreview } from "../lib/cliPreview";
import ErrorBox from "./ErrorBox";
import SuccessBox from "./SuccessBox";

interface Props {
  command: string;
  args: string[];
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
  testingCommand,
  commandTestError,
  commandTestSuccess,
  onCommandChange,
  onAddArg,
  onArgChange,
  onRemoveArg,
  onTestCommand,
}: Props) {
  const commandPreview = buildCommandPreview(command, args);
  return (
    <>
      <div>
        <label className="label label-required">Command</label>
        <p className="helper-text mb-2">
          Find the binary path with{" "}
          <code className="rounded bg-surface-tertiary px-1 py-0.5">
            which claude
          </code>
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={command}
            onChange={(e) => onCommandChange(e.target.value)}
            placeholder="e.g. claude"
            className="input flex-1 font-mono"
            {...CLI_INPUT_PROPS}
          />
          <button
            type="button"
            onClick={onTestCommand}
            disabled={testingCommand}
            className="btn btn-secondary"
          >
            {testingCommand ? "Testing…" : "Test"}
          </button>
        </div>
        {commandTestError && (
          <ErrorBox message={commandTestError} className="mt-2" />
        )}
        {commandTestSuccess && (
          <SuccessBox message={commandTestSuccess} className="mt-2" />
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">Arguments</label>
          <button
            type="button"
            onClick={onAddArg}
            className="btn btn-ghost py-1 text-[12px]"
          >
            <Plus size={12} />
            Add arg
          </button>
        </div>
        <p className="helper-text mb-2">
          Configure headless mode to capture stdout (e.g. -p).
        </p>
        <div className="space-y-2">
          {args.map((arg, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={arg}
                onChange={(e) => onArgChange(index, e.target.value)}
                placeholder="e.g. --print"
                className="input input-sm flex-1 font-mono"
                {...CLI_INPUT_PROPS}
              />
              <button
                type="button"
                onClick={() => onRemoveArg(index)}
                className="btn-icon btn-icon-danger flex size-[30px] shrink-0 items-center justify-center"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {args.length === 0 && (
            <p className="helper-text">
              No arguments. Common: --print -m sonnet
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="label mb-2">Command preview</label>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-surface-tertiary px-3 py-2 font-mono text-[12px]">
          {commandPreview}
        </pre>
        <p className="helper-text mt-2">
          Your copied text is appended as the final argument when the action
          runs.
        </p>
      </div>
    </>
  );
}
