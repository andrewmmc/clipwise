import type { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  title: string;
  description: string;
}

export default function EmptyState({ icon, title, description }: Props) {
  return (
    <div className="rounded-2xl border border-dashed border-border-strong bg-surface-primary/70 p-8 text-center backdrop-blur-sm">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle bg-surface-tertiary text-text-tertiary">
        {icon}
      </div>
      <p className="mt-3 text-[13px] font-semibold text-text-secondary">
        {title}
      </p>
      <p className="mt-1 text-[11px] text-text-tertiary">{description}</p>
    </div>
  );
}
