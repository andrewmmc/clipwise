interface Props {
  message: string;
  className?: string;
}

export default function SuccessBox({ message, className }: Props) {
  return (
    <div
      className={["feedback-box feedback-success", className]
        .filter(Boolean)
        .join(" ")}
    >
      {message}
    </div>
  );
}
