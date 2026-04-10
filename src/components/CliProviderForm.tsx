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
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Command <span className="text-red-500">*</span>
        </label>
        <p className="mb-1 text-xs text-gray-400">
          Find the installed binary path with{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-gray-600">
            where claude
          </code>
          ,{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-gray-600">
            where codex
          </code>
          , or{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-gray-600">
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
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
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
          <label className="text-xs font-medium text-gray-700">Arguments</label>
          <button
            type="button"
            onClick={onAddArg}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus size={12} />
            Add arg
          </button>
        </div>
        <p className="mb-2 text-xs text-gray-400">
          Configure the CLI to run in headless mode so LLM Actions can capture
          the output from stdout. For example,{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-gray-600">
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
                className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs font-mono focus:border-blue-400 focus:outline-none"
                {...CLI_INPUT_PROPS}
              />
              <button
                type="button"
                onClick={() => onRemoveArg(index)}
                className="rounded p-1 text-gray-400 hover:text-red-500"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {args.length === 0 && (
            <p className="text-xs text-gray-400">
              No arguments. Common: --print -m sonnet
            </p>
          )}
        </div>
      </div>
    </>
  );
}
