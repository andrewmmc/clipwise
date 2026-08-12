import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  ClipboardPaste,
  Copy,
  Cpu,
  Menu,
  Sparkles,
} from "lucide-react";
import type { ActionPreset } from "../lib/actionPresets";
import { ACTION_PRESETS } from "../lib/actionPresets";
import { getAppleAvailabilityMessage } from "../lib/appleAvailability";
import { getErrorMessage } from "../lib/errors";
import { tauriCommands } from "../lib/tauri";
import type { AppleModelAvailability, AppConfig } from "../types/config";
import ErrorBox from "./ErrorBox";

interface Props {
  config: AppConfig;
  reviewMode: boolean;
  onRefresh: () => Promise<void>;
  onSetupProvider: () => void;
  onChoosePreset: (preset: ActionPreset) => void;
  onFinish: () => Promise<void>;
  onDone: () => void;
}

const WORKFLOW = [
  { icon: Copy, label: "Copy", detail: "text in any app" },
  { icon: Menu, label: "Choose", detail: "a menu bar action" },
  { icon: ClipboardPaste, label: "Paste", detail: "the transformed text" },
] as const;

export default function GettingStarted({
  config,
  reviewMode,
  onRefresh,
  onSetupProvider,
  onChoosePreset,
  onFinish,
  onDone,
}: Props) {
  const hasProvider = config.providers.length > 0;
  const hasAction = config.actions.length > 0;
  const hasAppleProvider = config.providers.some(
    (provider) => provider.type === "apple",
  );
  const [appleStatus, setAppleStatus] = useState<AppleModelAvailability | null>(
    hasAppleProvider ? { available: true, reason: null } : null,
  );
  const [checkingApple, setCheckingApple] = useState(!hasAppleProvider);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasAppleProvider) {
      // The provider prop is authoritative, so synchronize the derived status.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAppleStatus({ available: true, reason: null });
      setCheckingApple(false);
      return;
    }

    let cancelled = false;
    setCheckingApple(true);
    void tauriCommands
      .prepareAppleProvider()
      .then(async (availability) => {
        if (cancelled) return;
        setAppleStatus(availability);
        await onRefresh();
      })
      .catch((cause) => {
        if (!cancelled) {
          setAppleStatus({ available: false, reason: "unknown" });
          setError(getErrorMessage(cause));
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingApple(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasAppleProvider, onRefresh]);

  const finish = async () => {
    setFinishing(true);
    setError(null);
    try {
      await onFinish();
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setFinishing(false);
    }
  };

  const unavailableMessage = getAppleAvailabilityMessage(appleStatus);

  return (
    <div className="mx-auto max-w-[760px] space-y-4">
      <section className="welcome-hero overflow-hidden rounded-2xl border border-border p-6">
        <div className="relative z-10 max-w-[560px]">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
            <Sparkles size={18} />
          </div>
          <p className="text-[12px] font-semibold tracking-[0.14em] text-accent uppercase">
            Getting started
          </p>
          <h2 className="mt-1 text-[25px] font-semibold tracking-[-0.025em] text-text-primary">
            Welcome to Clipwise
          </h2>
          <p className="mt-2 max-w-[520px] text-[13px] leading-5 text-text-secondary">
            Transform copied text with AI, directly from your Mac&apos;s menu
            bar. Set up two things, then Clipwise is ready anywhere you write.
          </p>
        </div>
      </section>

      <section className="card p-4" aria-label="How Clipwise works">
        <div className="grid grid-cols-3">
          {WORKFLOW.map(({ icon: Icon, label, detail }, index) => (
            <div
              key={label}
              className="relative flex items-center gap-3 px-3 first:pl-1 last:pr-1"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-tertiary text-text-secondary">
                <Icon size={16} />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-text-primary">
                  {index + 1}. {label}
                </p>
                <p className="text-[11px] text-text-tertiary">{detail}</p>
              </div>
              {index < WORKFLOW.length - 1 && (
                <ArrowRight
                  size={13}
                  className="absolute top-3.5 -right-1 text-text-tertiary"
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {error && <ErrorBox message={error} />}

      <div className="space-y-2">
        <section className="card p-4">
          <div className="flex items-start gap-3">
            <StepMarker complete={hasProvider} number={1} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-[13px] font-semibold text-text-primary">
                    Choose an AI provider
                  </h3>
                  <p className="mt-0.5 text-[12px] leading-5 text-text-tertiary">
                    {hasProvider
                      ? `${config.providers[0].name} is ready to use.`
                      : checkingApple
                        ? "Checking Apple Intelligence on this Mac…"
                        : (unavailableMessage ??
                          "Connect Apple Intelligence, an API, or a local CLI.")}
                  </p>
                </div>
                {!hasProvider && !checkingApple && (
                  <button
                    type="button"
                    onClick={onSetupProvider}
                    className="btn btn-primary shrink-0"
                  >
                    <Cpu size={14} />
                    Set Up Provider
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="card p-4">
          <div className="flex items-start gap-3">
            <StepMarker complete={hasAction} number={2} />
            <div className="min-w-0 flex-1">
              <h3 className="text-[13px] font-semibold text-text-primary">
                Create your first action
              </h3>
              <p className="mt-0.5 text-[12px] leading-5 text-text-tertiary">
                {hasAction
                  ? `“${config.actions[0].name}” is available in the menu bar.`
                  : hasProvider
                    ? "Start from a useful template, then adjust it before saving."
                    : "Choose a provider first, then select an action template."}
              </p>
              {!hasAction && hasProvider && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {ACTION_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => onChoosePreset(preset)}
                      className="onboarding-preset"
                    >
                      <Sparkles size={12} />
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="card p-4">
          <div className="flex items-start gap-3">
            <StepMarker complete={hasProvider && hasAction} number={3} />
            <div className="min-w-0 flex-1">
              <h3 className="text-[13px] font-semibold text-text-primary">
                Use Clipwise anywhere
              </h3>
              <p className="mt-0.5 text-[12px] leading-5 text-text-tertiary">
                Copy some text, click the Clipwise icon in the menu bar, choose
                your action, then paste the transformed result.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="text-[11px] text-text-tertiary">
          {hasProvider && hasAction
            ? "Everything is ready."
            : "Complete the provider and action steps to finish."}
        </p>
        {reviewMode ? (
          <button type="button" onClick={onDone} className="btn btn-primary">
            Done
          </button>
        ) : (
          <button
            type="button"
            disabled={!hasProvider || !hasAction || finishing}
            onClick={() => void finish()}
            className="btn btn-primary"
          >
            {finishing ? "Finishing…" : "Finish Setup"}
            {!finishing && <ArrowRight size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

function StepMarker({
  complete,
  number,
}: {
  complete: boolean;
  number: number;
}) {
  return (
    <div
      className={
        complete
          ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success text-white"
          : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-tertiary text-[11px] font-semibold text-text-tertiary"
      }
      aria-label={complete ? `Step ${number} complete` : `Step ${number}`}
    >
      {complete ? <Check size={13} strokeWidth={3} /> : number}
    </div>
  );
}
