import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-6">
        <div className="text-6xl font-bold text-primary tracking-tight">404</div>
        <h1 className="text-xl font-semibold text-on-surface">
          Page not found
        </h1>
        <p className="text-sm text-on-surface-variant">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Back to editor
        </Link>
      </div>
    </div>
  );
}
