// Извлечение видимой выдачи ATI. Только видимый DOM.
// НИ ОДНОГО запроса к API ATI. Никаких скрытых полей.
import { LOAD_CARD_SELECTORS, LOAD_ROW_SELECTORS, LOAD_LINK_SELECTORS, pickAll } from "./atiSelectors";
import { hashText, parseLoadText, type ParsedLoadFields } from "./parseLoadText";

export interface ExtractedAtiLoad extends ParsedLoadFields {
  source_external_ref?: string;
  source_card_anchor?: string;
  source_row_index?: number;
  raw_text: string;
  source_url?: string;
  agent_open_hint_json?: {
    selector?: string;
    rowIndex?: number;
    href?: string;
    textHash?: string;
  };
}

function isVisible(el: Element): boolean {
  const r = (el as HTMLElement).getBoundingClientRect?.();
  if (!r) return false;
  if (r.width < 20 || r.height < 20) return false;
  const style = window.getComputedStyle(el as HTMLElement);
  return style.visibility !== "hidden" && style.display !== "none";
}

function candidateElements(): { els: Element[]; strategy: string } {
  let els = pickAll(LOAD_ROW_SELECTORS).filter(isVisible);
  if (els.length > 0) return { els, strategy: "rows" };
  els = pickAll(LOAD_CARD_SELECTORS).filter(isVisible);
  if (els.length > 0) return { els, strategy: "cards" };
  // Fallback — контейнеры со ссылкой на карточку груза.
  const linkEls = pickAll(LOAD_LINK_SELECTORS).filter(isVisible);
  const containers = new Set<Element>();
  for (const a of linkEls) {
    const c = a.closest("article,li,tr,div");
    if (c) containers.add(c);
  }
  return { els: Array.from(containers), strategy: "link-fallback" };
}

function extractExternalRef(el: Element): string | undefined {
  const a = el.querySelector('a[href*="/loads/"], a[href*="/loadinfo/"]') as HTMLAnchorElement | null;
  if (a?.href) {
    const m = a.href.match(/loads?\/([^/?#]+)/i) || a.href.match(/loadinfo\/([^/?#]+)/i);
    if (m) return m[1];
  }
  const attr =
    (el as HTMLElement).getAttribute("data-load-id") ??
    (el as HTMLElement).getAttribute("data-testid") ??
    undefined;
  return attr ?? undefined;
}

function extractHref(el: Element): string | undefined {
  const a = el.querySelector('a[href*="/loads/"], a[href*="/loadinfo/"]') as HTMLAnchorElement | null;
  return a?.href ?? undefined;
}

export function extractVisibleLoads(): { loads: ExtractedAtiLoad[]; strategy: string } {
  const { els, strategy } = candidateElements();
  const loads: ExtractedAtiLoad[] = [];
  els.forEach((el, index) => {
    const raw = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!raw || raw.length < 8) return;
    const parsed = parseLoadText(raw);
    const externalRef = extractExternalRef(el);
    const href = extractHref(el);
    const textHash = hashText(raw.slice(0, 400));
    loads.push({
      ...parsed,
      raw_text: raw.slice(0, 600),
      source_row_index: index,
      source_external_ref: externalRef,
      source_card_anchor: (el as HTMLElement).id || undefined,
      source_url: href,
      agent_open_hint_json: {
        rowIndex: index,
        href,
        textHash,
        selector: strategy,
      },
    });
  });
  return { loads, strategy };
}
