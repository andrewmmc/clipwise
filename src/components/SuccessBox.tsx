import { cx } from "../lib/classNames";

interface Props {
  message: string;
  className?: string;
}

export default function SuccessBox({ message, className }: Props) {
  return (
    <div className={cx("feedback-box feedback-success", className)}>
      {message}
    </div>
  );
}
