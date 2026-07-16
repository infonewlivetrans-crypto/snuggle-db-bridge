// Единый источник адреса поиска ATI. НЕ дублировать литералы в других местах.
// Правильный адрес — https://loads.ati.su/. Старый https://ati.su/loads/ отдаёт 404.

export const ATI_LOADS_URL = "https://loads.ati.su/";
export const ATI_HOST_MATCH_PATTERNS: readonly string[] = [
  "https://loads.ati.su/*",
  "https://ati.su/*",
];

export function isAtiHost(hostnameOrUrl: string | null | undefined): boolean {
  if (!hostnameOrUrl) return false;
  let host = String(hostnameOrUrl).toLowerCase();
  if (host.includes("://")) {
    try { host = new URL(host).hostname.toLowerCase(); } catch { return false; }
  }
  return host === "ati.su" || host === "loads.ati.su" || host.endsWith(".ati.su");
}
