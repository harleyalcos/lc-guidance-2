import { errorText, FriendlyError } from "./errors";

export const GEMINI_MODEL = "gemini-3.1-flash-lite";

export function geminiEndpoint(apiKey: string, method: "generateContent" | "streamGenerateContent"): string {
  const query = method === "streamGenerateContent" ? "alt=sse&" : "";
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:${method}?${query}key=${encodeURIComponent(apiKey.trim())}`;
}

/** A Gemini failure with a counselor-friendly explanation attached. */
export class GeminiError extends Error {
  readonly status: number | null;
  readonly friendly: FriendlyError;
  /** True when the stored API key itself is the problem (invalid, expired, revoked). */
  readonly isKeyProblem: boolean;

  constructor(friendly: FriendlyError, status: number | null = null, isKeyProblem = false) {
    super(friendly.message);
    this.name = "GeminiError";
    this.status = status;
    this.friendly = friendly;
    this.isKeyProblem = isKeyProblem;
  }
}

function apiMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const error = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error;
    if (error?.message) return `${error.status ? `${error.status}: ` : ""}${error.message}`;
  } catch {
    // Not JSON (proxy/HTML error page); fall through to the raw text below.
  }
  return body.trim().slice(0, 600);
}

/** Map an HTTP error from the Gemini API to a clear explanation. */
export function geminiHttpError(status: number, body: string, title = "Guidance AI request failed"): GeminiError {
  const detail = `HTTP ${status}${body ? ` — ${apiMessage(body)}` : ""}`;
  const lower = body.toLowerCase();
  const keyInvalid = /api_key_invalid|api key not valid|api key expired|invalid api key/.test(lower);

  if (keyInvalid || status === 401 || status === 403) {
    const expired = lower.includes("expired");
    return new GeminiError(
      {
        title,
        message: expired
          ? "The Gemini API key has expired."
          : status === 403 && !keyInvalid
            ? "The Gemini API key was rejected. It may have been revoked or does not have access to this model."
            : "The Gemini API key is not valid.",
        guidance: "Open Settings → Guidance AI, paste a current API key from Google AI Studio, and save it.",
        details: detail,
      },
      status,
      true,
    );
  }
  if (status === 429) {
    return new GeminiError(
      {
        title,
        message: "The Gemini usage limit was reached for now.",
        guidance: "Wait a minute and try again. If this happens often, check the API key's quota in Google AI Studio.",
        details: detail,
      },
      status,
    );
  }
  if (status === 404) {
    return new GeminiError(
      {
        title,
        message: "The Gemini model used by this app is not available for this API key.",
        guidance: "Check that the API key belongs to a Google AI Studio project with Gemini access, or update the app.",
        details: detail,
      },
      status,
    );
  }
  if (status >= 500) {
    return new GeminiError(
      {
        title,
        message: "The Gemini service is temporarily unavailable.",
        guidance: "Wait a moment and try again.",
        details: detail,
      },
      status,
    );
  }
  return new GeminiError(
    {
      title,
      message: "Gemini could not process this request.",
      guidance: "Try rephrasing the request or starting a new conversation.",
      details: detail,
    },
    status,
  );
}

/** Describe any failure from a Gemini call (HTTP, network, timeout, parsing). */
export function describeGeminiFailure(error: unknown, title = "Guidance AI request failed"): FriendlyError {
  if (error instanceof GeminiError) return { ...error.friendly, title };
  const raw = errorText(error);
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  if (name === "TimeoutError" || /timed? ?out/i.test(raw)) {
    return {
      title,
      message: "Gemini took too long to respond.",
      guidance: "Check the internet connection and try again. Shorter or more specific questions respond faster.",
      details: raw || undefined,
    };
  }
  if (name === "TypeError" || /failed to fetch|load failed|network/i.test(raw)) {
    return {
      title,
      message: "The app could not reach the Gemini service.",
      guidance: "Check the computer's internet connection, then try again.",
      details: raw || undefined,
    };
  }
  return {
    title,
    message: "Guidance AI could not complete the request.",
    guidance: "Try again. If the problem continues, start a new conversation.",
    details: raw || undefined,
  };
}
