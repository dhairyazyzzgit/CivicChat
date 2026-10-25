function ErrorMessage({ text, onRetry }) {
  return (
    <div className="w-full max-w-[320px] rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger shadow-sm">
      <p className="font-medium">{text}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex rounded-full bg-danger px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#b91c1c]"
      >
        Retry
      </button>
    </div>
  );
}

export default ErrorMessage;
