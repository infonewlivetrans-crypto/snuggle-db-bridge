// Плавающая панель поверх страницы ATI. Изолирована через Shadow DOM,
// чтобы стили ATI не могли её сломать/скрыть. Панель отображается всегда,
// когда мы на loads.ati.su, независимо от того, идёт активный поиск или нет.
// НИКАКИХ данных ATI внутри не хранит — только статус агента.

const HOST_ID = "rt-agent-overlay-host";

export interface OverlayState {
  visible_count?: number;
  sent_count?: number;
  suitable_count?: number;
  status?: string;
  task_id?: string | null;
  connected?: boolean;
  agent_version?: string | null;
}

type OverlayAction = "read" | "send" | "hide" | "minimize" | "restore";

interface OverlayInternal {
  shadow: ShadowRoot;
  minimized: boolean;
  lastState: OverlayState;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = window as any;

function getOrCreateHost(): OverlayInternal {
  if (w.__rt_overlay) return w.__rt_overlay as OverlayInternal;
  const host = document.createElement("div");
  host.id = HOST_ID;
  // Позиционирование хоста — только через inline-стили, чтобы сайт не мог перебить.
  host.setAttribute("style", [
    "all: initial",
    "position: fixed",
    "right: 16px",
    "top: 16px",
    "z-index: 2147483647",
    "pointer-events: auto",
  ].join(";"));
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const state: OverlayInternal = { shadow, minimized: false, lastState: {} };
  w.__rt_overlay = state;
  // Защита от удаления страничным SPA-роутером: если хост исчезает — вернём.
  try {
    const mo = new MutationObserver(() => {
      if (!document.getElementById(HOST_ID) && w.__rt_overlay) {
        document.documentElement.appendChild(host);
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: false });
  } catch { /* ignore */ }
  return state;
}

function render(s: OverlayInternal, state: OverlayState, onAction?: (a: OverlayAction) => void): void {
  s.lastState = state;
  const style = `
    :host, * { all: initial; box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
    .wrap { color: #fff; background: #0f172a; border-radius: 10px;
      box-shadow: 0 6px 24px rgba(0,0,0,.35); padding: 10px 12px; width: 260px;
      font-size: 12px; line-height: 1.4; display: block; }
    .wrap.min { width: auto; padding: 6px 10px; cursor: pointer; }
    .title { font-weight: 600; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .ok { background: #22c55e; } .warn { background: #f59e0b; } .off { background: #ef4444; }
    .row { margin: 2px 0; }
    .muted { opacity: .75; }
    .btn-row { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
    button { cursor: pointer; border: 0; border-radius: 6px; padding: 6px 8px;
      font: 600 11px system-ui, -apple-system, sans-serif; }
    .primary { background: #22c55e; color: #0f172a; flex: 1; }
    .secondary { background: #38bdf8; color: #0f172a; flex: 1; }
    .ghost { background: transparent; color: #fff; border: 1px solid #334155; }
    .min-btn { background: transparent; color: #fff; border: 1px solid #334155; }
  `;
  const conn = state.connected;
  const dotCls = conn ? "ok" : (conn === false ? "off" : "warn");
  const statusText = state.status
    ?? (conn === true ? "Агент подключён" : conn === false ? "Агент не подключён" : "Проверка агента…");

  if (s.minimized) {
    s.shadow.innerHTML = `
      <style>${style}</style>
      <div class="wrap min" title="Радиус Трек · агент">
        <span class="dot ${dotCls}"></span>
        <span style="color:#fff;font-weight:600;font-size:11px;margin-left:6px">РТ</span>
      </div>
    `;
    const btn = s.shadow.querySelector(".wrap") as HTMLElement | null;
    btn?.addEventListener("click", () => { s.minimized = false; render(s, s.lastState, onAction); onAction?.("restore"); });
    return;
  }

  s.shadow.innerHTML = `
    <style>${style}</style>
    <div class="wrap">
      <div class="title">
        <span class="dot ${dotCls}"></span>
        Радиус Трек · агент${state.agent_version ? ` <span class="muted" style="font-weight:400">v${state.agent_version}</span>` : ""}
      </div>
      <div class="row muted">${statusText}</div>
      <div class="row">Видно грузов: <b>${state.visible_count ?? "—"}</b></div>
      <div class="row">Отправлено: <b>${state.sent_count ?? "—"}</b></div>
      <div class="row">Подходит: <b>${state.suitable_count ?? "—"}</b></div>
      <div class="row muted">Задача: ${state.task_id ? state.task_id.slice(0, 8) + "…" : "—"}</div>
      <div class="btn-row">
        <button class="primary" data-a="read">Прочитать</button>
        <button class="secondary" data-a="send">Отправить</button>
        <button class="min-btn" data-a="minimize" title="Свернуть">–</button>
      </div>
    </div>
  `;
  s.shadow.querySelectorAll("button[data-a]").forEach((b) => {
    b.addEventListener("click", () => {
      const a = (b as HTMLElement).dataset.a as OverlayAction;
      if (a === "minimize") { s.minimized = true; render(s, s.lastState, onAction); }
      onAction?.(a);
    });
  });
}

export function showOverlay(state: OverlayState = {}, onAction?: (a: OverlayAction) => void): void {
  const s = getOrCreateHost();
  render(s, { ...s.lastState, ...state }, onAction);
}

export function updateOverlay(patch: OverlayState): void {
  if (!w.__rt_overlay) return;
  const s = w.__rt_overlay as OverlayInternal;
  render(s, { ...s.lastState, ...patch });
}

export function hideOverlay(): void {
  document.getElementById(HOST_ID)?.remove();
  try { delete w.__rt_overlay; } catch { w.__rt_overlay = undefined; }
}
