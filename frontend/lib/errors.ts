/**
 * Client-side error logging utility.
 *
 * - Full error details logged to console for debugging
 * - User-facing messages are always safe, generic, and actionable
 */

const ERROR_MAP: Record<string, string> = {
  "Failed to fetch": "Network error — check your connection and try again.",
  "NetworkError": "Network error — check your connection and try again.",
  "TimeoutError": "Request timed out — try again.",
  "AbortError": "Request was cancelled.",
};

function sanitizeMessage(raw: string): string {
  // Check known patterns first
  for (const [pattern, safe] of Object.entries(ERROR_MAP)) {
    if (raw.includes(pattern)) return safe;
  }

  // Never expose: file paths, URLs, stack traces, internal status codes
  if (raw.includes("ECONNREFUSED")) return "Service temporarily unavailable — try again.";
  if (raw.includes("ENOTFOUND")) return "Network error — check your connection.";
  if (raw.includes("fetch")) return "Network error — check your connection and try again.";
  if (/HTTP \d{3}/.test(raw)) return "Something went wrong — try again.";
  if (raw.includes("/") && raw.includes(".")) return "Something went wrong — try again.";

  // If nothing matched, return a safe generic message
  return "Something went wrong — try again.";
}

interface LogContext {
  component?: string;
  action?: string;
  route?: string;
  [key: string]: unknown;
}

/**
 * Log an error safely: full details for devs, sanitized message for users.
 * Returns the safe user-facing message.
 */
export function logError(
  err: unknown,
  context?: LogContext
): string {
  const raw = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const safe = sanitizeMessage(raw);

  // Structured log for developers
  console.error("[VoxSlides Error]", {
    timestamp: new Date().toISOString(),
    message: raw,
    stack,
    ...context,
  });

  return safe;
}

/**
 * Log a fetch/API error with response details.
 * Returns the safe user-facing message.
 */
export function logApiError(
  res: Response,
  body: unknown,
  context?: LogContext
): string {
  const status = res.status;
  const rawError =
    typeof body === "object" && body !== null && "error" in body
      ? String((body as { error: unknown }).error)
      : `HTTP ${status}`;

  console.error("[VoxSlides API Error]", {
    timestamp: new Date().toISOString(),
    status,
    url: res.url,
    message: rawError,
    ...context,
  });

  // Never expose raw API error messages to users
  if (status === 400) return "Invalid request — check your input and try again.";
  if (status === 401 || status === 403) return "Authentication error — please log in again.";
  if (status === 404) return "Service not found — try again later.";
  if (status === 422) return "Could not process your request — check your input.";
  if (status === 429) return "Too many requests — wait a moment and try again.";
  if (status >= 500) return "Service error — try again later.";

  return "Something went wrong — try again.";
}
