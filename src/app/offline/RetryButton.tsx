"use client";

export default function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => location.reload()}
      className="px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition"
    >
      Try again
    </button>
  );
}
