// Подсветка строк/карточек выдачи. Аккуратные бейджи, без агрессивных стилей.
// Не изменяет структуру страницы ATI.
import { LOAD_CARD_SELECTORS, LOAD_ROW_SELECTORS, pickAll } from "./atiSelectors";

export type ScoreEntry = {
  source_row_index?: number | null;
  source_external_ref?: string | null;
  text_hash?: string | null;
  candidate_id?: string | null;
  match_score?: number | null;
  status?: string | null;
  ai_warnings?: unknown;
};

const BADGE_CLASS = "rt-agent-badge";
const WRAP_ATTR = "data-rt-agent-highlighted";

function colorFor(score: number | null | undefined): { border: string; badgeBg: string; label: string } {
  if (score == null) return { border: "#d1d5db", badgeBg: "#9ca3af", label: "?" };
  if (score >= 80) return { border: "#16a34a", badgeBg: "#16a34a", label: "Подходит" };
  if (score >= 60) return { border: "#eab308", badgeBg: "#ca8a04", label: "Можно" };
  if (score >= 40) return { border: "#f97316", badgeBg: "#ea580c", label: "Риск" };
  return { border: "#ef4444", badgeBg: "#dc2626", label: "Не подходит" };
}

export function clearHighlights(): void {
  document.querySelectorAll(`[${WRAP_ATTR}]`).forEach((el) => {
    (el as HTMLElement).style.outline = "";
    (el as HTMLElement).style.outlineOffset = "";
    el.removeAttribute(WRAP_ATTR);
  });
  document.querySelectorAll(`.${BADGE_CLASS}`).forEach((el) => el.remove());
}

function allRowElements(): Element[] {
  const rows = pickAll(LOAD_ROW_SELECTORS);
  if (rows.length) return rows;
  return pickAll(LOAD_CARD_SELECTORS);
}

export function applyHighlights(entries: ScoreEntry[]): number {
  clearHighlights();
  const rows = allRowElements();
  let applied = 0;
  for (const entry of entries) {
    const idx = entry.source_row_index;
    if (idx == null || idx < 0 || idx >= rows.length) continue;
    const el = rows[idx] as HTMLElement;
    const { border, badgeBg, label } = colorFor(entry.match_score);
    el.style.outline = `2px solid ${border}`;
    el.style.outlineOffset = "-2px";
    el.setAttribute(WRAP_ATTR, "1");

    const badge = document.createElement("div");
    badge.className = BADGE_CLASS;
    badge.textContent = `РТ ${entry.match_score ?? "?"} · ${label}`;
    Object.assign(badge.style, {
      position: "absolute",
      zIndex: "2147483000",
      background: badgeBg,
      color: "#fff",
      font: "600 11px/1.2 system-ui, sans-serif",
      padding: "3px 6px",
      borderRadius: "6px",
      pointerEvents: "auto",
      cursor: "help",
      boxShadow: "0 1px 3px rgba(0,0,0,.15)",
    } as CSSStyleDeclaration);

    // Позиционируем в правом верхнем углу строки.
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    badge.style.top = "4px";
    badge.style.right = "4px";
    const warnings = Array.isArray(entry.ai_warnings) ? entry.ai_warnings.join("; ") : "";
    badge.title = warnings || `candidate: ${entry.candidate_id ?? "—"}`;
    el.appendChild(badge);

    // Кнопка "В звонки". Никаких автозвонков — только добавление в очередь.
    if (entry.candidate_id) {
      const callBtn = document.createElement("button");
      callBtn.textContent = "В звонки";
      callBtn.dataset.rtCandidateId = entry.candidate_id;
      Object.assign(callBtn.style, {
        position: "absolute", top: "28px", right: "4px", zIndex: "2147483000",
        background: "#0f172a", color: "#fff", border: "0", borderRadius: "6px",
        padding: "3px 6px", font: "600 11px system-ui, sans-serif", cursor: "pointer",
      } as CSSStyleDeclaration);
      callBtn.addEventListener("click", (ev) => {
        ev.stopPropagation(); ev.preventDefault();
        callBtn.disabled = true; callBtn.textContent = "…";
        try {
          chrome.runtime.sendMessage(
            { type: "rt/add-to-call-queue", candidate_id: entry.candidate_id },
            (resp: { ok?: boolean; error?: string; already?: boolean } | undefined) => {
              callBtn.disabled = false;
              if (resp?.ok) callBtn.textContent = resp.already ? "Уже в очереди" : "Добавлено";
              else callBtn.textContent = "Ошибка";
            },
          );
        } catch { callBtn.textContent = "Ошибка"; callBtn.disabled = false; }
      });
      el.appendChild(callBtn);
    }
    applied++;
  }
  return applied;
}

