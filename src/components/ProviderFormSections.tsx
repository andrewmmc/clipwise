import type { ProviderType } from "../types/config";

interface AppleProviderSectionProps {
  duplicateMessage: string | null;
  unavailableMessage: string | null;
}

export function AppleProviderSection({
  duplicateMessage,
  unavailableMessage,
}: AppleProviderSectionProps) {
  return (
    <div className="space-y-1">
      <p className="text-[12px] text-text-secondary">
        Uses Apple&apos;s on-device Foundation Model. No API key or
        configuration needed. Runs privately on your Mac.
      </p>
      {(duplicateMessage || unavailableMessage) && (
        <p className="text-[12px] text-amber-600">
          {duplicateMessage ?? unavailableMessage}
        </p>
      )}
    </div>
  );
}

interface ProviderTypeOptionProps {
  type: ProviderType;
  label: string;
  disabled?: boolean;
}

export function ProviderTypeOption({
  type,
  label,
  disabled,
}: ProviderTypeOptionProps) {
  return (
    <option value={type} disabled={disabled}>
      {label}
    </option>
  );
}
