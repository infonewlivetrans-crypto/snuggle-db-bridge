// Определяет, что перед нами именно страница ATI с выдачей грузов.
export interface PageInfo {
  isAtiPage: boolean;
  isLoadsSearchPage: boolean;
  pageUrl: string;
  pageTitle: string;
  detectedAt: string;
}

export function detectPage(): PageInfo {
  const url = window.location.href;
  const host = window.location.hostname;
  const path = window.location.pathname;
  const isAtiPage = /(^|\.)ati\.su$/i.test(host);
  const isLoadsSearchPage = isAtiPage && /\/loads(\/|$|\?)/i.test(path);
  return {
    isAtiPage,
    isLoadsSearchPage,
    pageUrl: url,
    pageTitle: document.title || "",
    detectedAt: new Date().toISOString(),
  };
}
