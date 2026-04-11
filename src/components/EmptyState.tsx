import type { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  title: string;
  description: string;
}

export default function EmptyState({ icon, title, description }: Props) {
  return (
    <div className="empty-state">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-tertiary text-text-tertiary">
        {icon}
      </div>
      <p className="mt-3 text-[13px] font-medium text-text-primary">{title}</p>
      <p className="mt-1 text-[12px] text-text-tertiary">{description}</p>
    </div>
  );
}
