// Единый источник версий Radius Track Browser Agent.
// НЕ дублировать эти константы в других файлах — импортировать отсюда.
// BUILD_DATE подставляется esbuild define при сборке.

export const AGENT_VERSION = "0.2.0";
export const AGENT_PROTOCOL_VERSION = "1";
export const ATI_SELECTOR_CONFIG_VERSION = "dev-1";
export const BUILD_CHANNEL: "dev" | "beta" | "stable" = "dev";
export const MIN_SUPPORTED_WEB_VERSION = "0.1.0";

// __RT_BUILD_DATE__ заменяется esbuild define. Fallback: пустая строка.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const __RT_BUILD_DATE__: string;
export const BUILD_DATE: string =
  typeof __RT_BUILD_DATE__ !== "undefined" ? __RT_BUILD_DATE__ : "";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const __RT_COMMIT_SHA__: string;
export const COMMIT_SHA: string | null =
  typeof __RT_COMMIT_SHA__ !== "undefined" && __RT_COMMIT_SHA__ ? __RT_COMMIT_SHA__ : null;
