// Определяет поддержку установки распакованного расширения.
// Chrome / Chromium на десктопе — да. Всё остальное — нет.
export interface DeviceSupport {
  supported: boolean;
  reason: "ok" | "mobile" | "non_chrome" | "unknown";
  browserLabel: string;
}

export function detectDeviceSupport(): DeviceSupport {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "unknown", browserLabel: "неизвестно" };
  }
  const ua = navigator.userAgent;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const isChromium = /Chrome\/\d/.test(ua) && !/Edg\//.test(ua) ? true : /Chrome\/\d/.test(ua);
  const isFirefox = /Firefox\//.test(ua);
  const isSafari = /Safari\//.test(ua) && !/Chrome\//.test(ua);

  if (isMobile) return { supported: false, reason: "mobile", browserLabel: "мобильный браузер" };
  if (isFirefox) return { supported: false, reason: "non_chrome", browserLabel: "Firefox" };
  if (isSafari) return { supported: false, reason: "non_chrome", browserLabel: "Safari" };
  if (!isChromium) return { supported: false, reason: "non_chrome", browserLabel: "неизвестный браузер" };
  return { supported: true, reason: "ok", browserLabel: "Chrome" };
}
