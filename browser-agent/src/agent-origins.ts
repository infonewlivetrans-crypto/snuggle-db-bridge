// Radius Track Browser Agent — Web-origin whitelist (mirror of src/lib/ai-dispatcher/agent-origins.ts).
// Сюда попадают только Web-страницы Радиус Трек. ATI-страницы обрабатываются отдельным content script.

const STATIC_ALLOWED: readonly string[] = [
  "https://radius-track.ru",
  "https://www.radius-track.ru",
  "https://snuggle-db-bridge.lovable.app",
  "https://id-preview--d0d5cb47-0414-4a28-a4e9-a8beda3d2828.lovable.app",
];

const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

export function normalizeOrigin(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const u = new URL(input);
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
  if (LOCALHOST_HOSTS.has(u.hostname)) return true;
  if (u.protocol !== "https:") return false;
  return STATIC_ALLOWED.some((allowed) => normalizeOrigin(allowed) === origin);
}

export function getTrustedAgentOrigins(): string[] {
  return [...STATIC_ALLOWED];
}
