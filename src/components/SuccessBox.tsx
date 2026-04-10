interface Props {
  message: string;
}

export default function SuccessBox({ message }: Props) {
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
      {message}
    </div>
  );
}
