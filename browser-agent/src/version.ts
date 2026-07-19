// Единый источник версий Radius Track Browser Agent.
// НЕ дублировать эти константы в других файлах — импортировать отсюда.
// BUILD_CHANNEL и BUILD_DATE подставляются esbuild define при сборке.

export const AGENT_VERSION = "0.2.7";
export const AGENT_PROTOCOL_VERSION = "1";
export const ATI_SELECTOR_CONFIG_VERSION = "dev-2";
export const MIN_SUPPORTED_WEB_VERSION = "0.1.0";

// __RT_CHANNEL__ заменяется esbuild define. Fallback — dev.
declare const __RT_CHANNEL__: string;
export const BUILD_CHANNEL: "dev" | "beta" | "stable" =
  (typeof __RT_CHANNEL__ !== "undefined" ? (__RT_CHANNEL__ as "dev" | "beta" | "stable") : "dev");

declare const __RT_BUILD_DATE__: string;
export const BUILD_DATE: string =
  typeof __RT_BUILD_DATE__ !== "undefined" ? __RT_BUILD_DATE__ : "";

declare const __RT_COMMIT_SHA__: string;
export const COMMIT_SHA: string | null =
  typeof __RT_COMMIT_SHA__ !== "undefined" && __RT_COMMIT_SHA__ ? __RT_COMMIT_SHA__ : null;
