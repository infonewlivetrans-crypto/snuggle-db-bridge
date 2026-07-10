// useAgentRelease — загружает /downloads/browser-agent/latest.json.
// Публичный статический файл, кэш-бастинг timestamp, без секретов.
import { useEffect, useState } from "react";

export interface AgentRelease {
  latestVersion: string;
  minSupportedVersion: string;
  fileName: string;
  downloadUrl: string;
  sizeBytes: number;
  sha256: string;
  publishedAt: string;
  releaseNotes: string[];
  chromeWebStoreUrl: string | null;
}

const LATEST_URL = "/downloads/browser-agent/latest.json";
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function isSafeDownloadUrl(u: unknown): u is string {
  return typeof u === "string" && /^\/downloads\/browser-agent\/[\w.-]+\.zip$/.test(u);
}

function parseRelease(x: unknown): AgentRelease | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.latestVersion !== "string" || !SEMVER_RE.test(o.latestVersion)) return null;
  if (typeof o.minSupportedVersion !== "string" || !SEMVER_RE.test(o.minSupportedVersion))
    return null;
  if (!isSafeDownloadUrl(o.downloadUrl)) return null;
  if (typeof o.fileName !== "string" || !o.fileName.endsWith(".zip")) return null;
  if (typeof o.sizeBytes !== "number" || o.sizeBytes <= 0) return null;
  if (typeof o.sha256 !== "string" || o.sha256.length < 32) return null;
  return {
    latestVersion: o.latestVersion,
    minSupportedVersion: o.minSupportedVersion,
    fileName: o.fileName,
    downloadUrl: o.downloadUrl,
    sizeBytes: o.sizeBytes,
    sha256: o.sha256,
    publishedAt: typeof o.publishedAt === "string" ? o.publishedAt : "",
    releaseNotes: Array.isArray(o.releaseNotes)
      ? o.releaseNotes.filter((n): n is string => typeof n === "string")
      : [],
    chromeWebStoreUrl:
      typeof o.chromeWebStoreUrl === "string" && o.chromeWebStoreUrl.startsWith("https://")
        ? o.chromeWebStoreUrl
        : null,
  };
}

export function useAgentRelease() {
  const [release, setRelease] = useState<AgentRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${LATEST_URL}?ts=${Date.now()}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`http_${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const parsed = parseRelease(data);
        if (!parsed) throw new Error("invalid_manifest");
        setRelease(parsed);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { release, loading, error };
}

// SemVer compare: returns -1, 0, or 1.
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10));
  const pb = b.split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export type VersionState =
  | { kind: "unknown" }
  | { kind: "outdated_blocking"; installed: string; min: string; latest: string }
  | { kind: "update_available"; installed: string; latest: string }
  | { kind: "current"; installed: string };

export function classifyVersion(
  installed: string | undefined,
  release: AgentRelease | null,
): VersionState {
  if (!installed || !SEMVER_RE.test(installed) || !release) return { kind: "unknown" };
  if (compareSemver(installed, release.minSupportedVersion) < 0) {
    return {
      kind: "outdated_blocking",
      installed,
      min: release.minSupportedVersion,
      latest: release.latestVersion,
    };
  }
  if (compareSemver(installed, release.latestVersion) < 0) {
    return { kind: "update_available", installed, latest: release.latestVersion };
  }
  return { kind: "current", installed };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(2)} МБ`;
}
