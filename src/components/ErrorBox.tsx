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
        "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {title && <p className="font-semibold text-red-700">{title}</p>}
      <p className={title ? "mt-1" : undefined}>{message}</p>
      {action}
    </div>
  );
}
