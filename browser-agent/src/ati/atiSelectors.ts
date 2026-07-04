// Селекторы для видимой выдачи ATI. Ничего скрытого, только видимый DOM.
// API ATI не используется. Все селекторы намеренно "мягкие" — если разметка
// изменится, мы деградируем к fallback-разбору видимого текста.

export const LOAD_ROW_SELECTORS = [
  '[data-testid*="loads-list-item"]',
  '[data-testid*="loads-list-row"]',
  '[class*="loads-list__row"]',
  '[class*="LoadsList__row"]',
  'tr[data-load-id]',
];

export const LOAD_CARD_SELECTORS = [
  '[data-testid*="loads-card"]',
  '[data-testid="load-item"]',
  '[class*="loads-item"]',
  '[class*="load-card"]',
  'article[class*="load"]',
];

export const LOAD_LINK_SELECTORS = [
  'a[href*="/loads/"]',
  'a[href*="/loadinfo/"]',
];

export const PRICE_SELECTORS = [
  '[data-testid*="price"]',
  '[class*="price"]',
  '[class*="Price"]',
];

export const ROUTE_SELECTORS = [
  '[data-testid*="route"]',
  '[class*="route"]',
  '[class*="Route"]',
  '[class*="city"]',
];

export const DATE_SELECTORS = [
  '[data-testid*="date"]',
  '[class*="date"]',
  '[class*="Date"]',
];

/** Все стратегии подряд, первая непустая выигрывает. */
export function pickAll(selectors: string[], root: ParentNode = document): Element[] {
  const out: Element[] = [];
  const seen = new Set<Element>();
  for (const sel of selectors) {
    let list: NodeListOf<Element>;
    try { list = root.querySelectorAll(sel); } catch { continue; }
    for (const el of Array.from(list)) {
      if (seen.has(el)) continue;
      seen.add(el);
      out.push(el);
    }
  }
  return out;
}
