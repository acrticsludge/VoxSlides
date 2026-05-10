"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="text-4xl">🔊</div>
        <h1 className="text-xl font-bold text-foreground font-sans">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground">
          VoxSlides encountered an unexpected error. This is usually temporary.
        </p>
        <button
          onClick={reset}
          className="px-6 py-2 rounded-lg bg-accent text-accent-foreground font-medium text-sm hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
