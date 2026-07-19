// Radius Track Browser Agent — Web-origin whitelist.
// Production (stable) allows ONLY radius-track.ru. Dev channel extras
// are injected by esbuild define (__RT_DEV_ORIGINS__), so no lovable.app
// or preview literal ends up in the stable bundle.

declare const __RT_CHANNEL__: string;
declare const __RT_DEV_ORIGINS__: string[];

const CHANNEL: "dev" | "stable" | "beta" =
  (typeof __RT_CHANNEL__ !== "undefined" ? (__RT_CHANNEL__ as "dev" | "stable" | "beta") : "dev");

const STABLE_ALLOWED: readonly string[] = [
  "https://radius-track.ru",
  "https://www.radius-track.ru",
];

const DEV_EXTRAS: readonly string[] =
  typeof __RT_DEV_ORIGINS__ !== "undefined" ? __RT_DEV_ORIGINS__ : [];

const STATIC_ALLOWED: readonly string[] =
  CHANNEL === "stable" ? STABLE_ALLOWED : [...STABLE_ALLOWED, ...DEV_EXTRAS];

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
  if (CHANNEL !== "stable" && LOCALHOST_HOSTS.has(u.hostname)) return true;
  if (u.protocol !== "https:") return false;
  return STATIC_ALLOWED.some((allowed) => normalizeOrigin(allowed) === origin);
}

export function getTrustedAgentOrigins(): string[] {
  return [...STATIC_ALLOWED];
}

