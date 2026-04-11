import type { ReactNode } from "react";

interface Props {
  message: string;
  title?: string;
  action?: ReactNode;
  className?: string;
}

export default function ErrorBox({ message, title, action, className }: Props) {
  return (
    <div
      className={[
        "rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-[13px] text-error",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {title && <p className="font-semibold text-error">{title}</p>}
      <p className={title ? "mt-1" : undefined}>{message}</p>
      {action}
    </div>
  );
}
