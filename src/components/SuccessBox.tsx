interface Props {
  message: string;
}

export default function SuccessBox({ message }: Props) {
  return (
    <div className="rounded-xl border border-success/20 bg-success/10 px-3 py-2 text-[13px] text-success">
      {message}
    </div>
  );
}
