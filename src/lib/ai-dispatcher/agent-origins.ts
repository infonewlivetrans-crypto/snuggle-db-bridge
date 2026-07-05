// Client-safe whitelist доверенных Web-origin для Radius Track Browser Agent.
// Один и тот же список должен использовать Web и Browser Agent (см. browser-agent/src/agent-origins.ts).
// НЕ разрешаем произвольные lovable.app / file:// / chrome-extension:// / javascript:.

const STATIC_ALLOWED: readonly string[] = [
  "https://radius-track.ru",
  "https://www.radius-track.ru",
  // Текущий Lovable published origin проекта:
  "https://snuggle-db-bridge.lovable.app",
  // Текущий Lovable dev preview origin проекта:
  "https://id-preview--d0d5cb47-0414-4a28-a4e9-a8beda3d2828.lovable.app",
];

const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

export function normalizeOrigin(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const u = new URL(input);
    // origin включает protocol + host + port, без trailing slash.
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}

export function isTrustedAgentOrigin(input: string | null | undefined): boolean {
  const origin = normalizeOrigin(input);
  if (!origin) return false;
  let u: URL;
  try { u = new URL(origin); } catch { return false; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  // localhost dev — только http, любой порт.
  if (LOCALHOST_HOSTS.has(u.hostname)) return true;
  // https only для остальных.
  if (u.protocol !== "https:") return false;
  return STATIC_ALLOWED.some((allowed) => normalizeOrigin(allowed) === origin);
}

export function getTrustedAgentOrigins(): string[] {
  return [...STATIC_ALLOWED];
}
