import { getEnv } from "@/lib/env";

const DEFAULT_TIMEOUT_MS = 15000;

/** Pause execution for the given milliseconds (used to throttle scrape requests). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/** Fetch a URL as text with a project user-agent and timeout. */
export async function fetchText(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<string> {
  const res = await fetchWithTimeout(url, init);
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} for ${url}`);
  }
  return res.text();
}

/** Fetch a URL as JSON with a project user-agent and timeout. */
export async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const res = await fetchWithTimeout(url, init);
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    init?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": getEnv().SCRAPE_USER_AGENT,
        accept: "application/json, text/plain, */*",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}
