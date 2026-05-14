// Production-домен для invite-ссылок. Всегда генерируем абсолютный URL
// на radius-track.ru, даже если админка открыта в Lovable preview.
const DEFAULT_PUBLIC_APP_URL = "https://radius-track.ru";

function getPublicAppUrl(): string {
  const fromEnv =
    (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) ??
    (typeof process !== "undefined"
      ? (process.env?.SERVER_PUBLIC_APP_URL ?? process.env?.VITE_PUBLIC_APP_URL)
      : undefined);
  const raw = (fromEnv && String(fromEnv).trim()) || DEFAULT_PUBLIC_APP_URL;
  return raw.replace(/\/+$/, "");
}

export function inviteUrl(token: string): string {
  return `${getPublicAppUrl()}/invite/${token}`;
}

export function isPreviewHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host.includes("lovable.app") ||
    host.includes("lovable.dev") ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
}
