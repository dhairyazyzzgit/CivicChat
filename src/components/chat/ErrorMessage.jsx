function ErrorMessage({ text, onRetry }) {
  return (
    <div role="alert" className="w-full max-w-[340px] rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <p className="font-medium leading-snug">{text}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex min-h-9 items-center rounded-full bg-rose-700 px-4 text-xs font-semibold text-white transition hover:bg-rose-800 active:scale-95"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export default ErrorMessage;
