import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export default function SectionHeader({ title, description, actions }: Props) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-[13px] font-semibold text-text-primary">{title}</h2>
        {description && (
          <p className="mt-0.5 text-[12px] text-text-tertiary">{description}</p>
        )}
      </div>
      {actions}
    </div>
  );
}
