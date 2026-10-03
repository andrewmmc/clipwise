import type { ReactNode } from "react";
import { cx } from "../lib/classNames";

interface Props {
  message: string;
  title?: string;
  action?: ReactNode;
  className?: string;
}

export default function ErrorBox({ message, title, action, className }: Props) {
  return (
    <div className={cx("feedback-box feedback-error", className)}>
      {title && <p className="font-semibold">{title}</p>}
      <p className={title ? "mt-1" : undefined}>{message}</p>
      {action}
    </div>
  );
}
