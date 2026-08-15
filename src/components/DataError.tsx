"use client";

interface Props {
  message?: string | null;
  onRetry?: () => void;
}

export default function DataError({ message, onRetry }: Props) {
  if (!message) return null;
  return (
    <div
      className="mx-6 lg:mx-8 mt-4 rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3"
      style={{
        background: "var(--status-occupied-bg)",
        color: "var(--status-occupied)",
        border: "1px solid rgba(192,57,43,0.25)",
      }}
      role="alert"
    >
      <span>Could not load data: {message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-semibold underline shrink-0"
        >
          Retry
        </button>
      )}
    </div>
  );
}
