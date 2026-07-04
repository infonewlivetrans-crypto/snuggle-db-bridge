// Небольшая плавающая панель поверх страницы ATI.
// Отображает статус агента. Никаких данных ATI не хранит.

const OVERLAY_ID = "rt-agent-overlay";

export interface OverlayState {
  visible_count?: number;
  sent_count?: number;
  suitable_count?: number;
  status?: string;
  task_id?: string | null;
}

export function showOverlay(state: OverlayState = {}, onAction?: (a: "read" | "send" | "hide") => void): void {
  let root = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement("div");
    root.id = OVERLAY_ID;
    Object.assign(root.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: "2147483600",
      background: "#0f172a",
      color: "#fff",
      font: "12px/1.4 system-ui, sans-serif",
      padding: "10px 12px",
      borderRadius: "10px",
      boxShadow: "0 6px 24px rgba(0,0,0,.25)",
      width: "260px",
    } as CSSStyleDeclaration);
    document.documentElement.appendChild(root);
  }
  root.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px">Радиус Трек · агент</div>
    <div style="opacity:.85;margin-bottom:6px">
      Читает только видимую выдачу на открытой странице. API ATI не используется.
    </div>
    <div>Видно грузов: <b>${state.visible_count ?? "—"}</b></div>
    <div>Отправлено: <b>${state.sent_count ?? "—"}</b></div>
    <div>Подходит: <b>${state.suitable_count ?? "—"}</b></div>
    <div style="opacity:.7;margin:6px 0 8px">Задача: ${state.task_id ?? "—"}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button data-a="read" style="flex:1;background:#22c55e;color:#0f172a;border:0;border-radius:6px;padding:6px;font:600 11px system-ui;cursor:pointer">Прочитать</button>
      <button data-a="send" style="flex:1;background:#38bdf8;color:#0f172a;border:0;border-radius:6px;padding:6px;font:600 11px system-ui;cursor:pointer">Отправить</button>
      <button data-a="hide" style="flex:0 0 auto;background:transparent;color:#fff;border:1px solid #334155;border-radius:6px;padding:6px 8px;font:600 11px system-ui;cursor:pointer">Скрыть</button>
    </div>
  `;
  root.querySelectorAll("button[data-a]").forEach((b) => {
    b.addEventListener("click", () => onAction?.((b as HTMLElement).dataset.a as "read" | "send" | "hide"));
  });
}

export function hideOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}
