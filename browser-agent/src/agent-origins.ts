// Radius Track Browser Agent — Web-origin whitelist.
// Production (stable) allows ONLY radius-track.ru. Dev channel adds
// Lovable preview hosts and localhost so the extension can talk to the
// unpublished preview. __RT_CHANNEL__ is injected by esbuild define.

declare const __RT_CHANNEL__: string;
const CHANNEL: "dev" | "stable" | "beta" =
  (typeof __RT_CHANNEL__ !== "undefined" ? (__RT_CHANNEL__ as "dev" | "stable" | "beta") : "dev");

const STABLE_ALLOWED: readonly string[] = [
  "https://radius-track.ru",
  "https://www.radius-track.ru",
];

// Dev-only extras are computed lazily so esbuild + minifier can dead-code
// eliminate them when CHANNEL === "stable". Reference by string concatenation
// so no lovable.app literal appears in stable bundle after DCE. Keeping the
// literals in a single function guarded by `CHANNEL !== "stable"` lets the
// minifier drop the entire branch.
function devExtras(): readonly string[] {
  if (CHANNEL === "stable") return [];
  const l = "lovable" + "." + "app";
  return [
    `https://snuggle-db-bridge.${l}`,
    `https://id-preview--d0d5cb47-0414-4a28-a4e9-a8beda3d2828.${l}`,
  ];
}

const STATIC_ALLOWED: readonly string[] =
  CHANNEL === "stable" ? STABLE_ALLOWED : [...STABLE_ALLOWED, ...devExtras()];

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
