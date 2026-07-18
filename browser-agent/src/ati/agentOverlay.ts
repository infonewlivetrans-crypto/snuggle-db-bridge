// Плавающая панель поверх loads.ati.su.
// Монтируется через ОДИН host `radius-track-agent-host` + Shadow DOM.
// CSS кладётся только в отдельный <style>.textContent — никакого innerHTML
// со стилями, никаких `all:initial` на `*` (иначе <style> становится
// display:inline и CSS показывается как текст на странице ATI).
// Никаких кнопок «Прочитать»/«Отправить» — только статус и свернуть.

const HOST_ID = "radius-track-agent-host";
// Старые id/классы, которые могли остаться от прежних версий.
const LEGACY_HOST_IDS = ["rt-agent-overlay-host"];

export interface OverlayState {
  visible_count?: number;
  sent_count?: number;
  suitable_count?: number;
  status?: string;
  task_id?: string | null;
  connected?: boolean;
  agent_version?: string | null;
}

type OverlayAction = "hide" | "minimize" | "restore";

interface OverlayInternal {
  host: HTMLElement;
  shadow: ShadowRoot;
  styleEl: HTMLStyleElement;
  uiRoot: HTMLElement;
  minimized: boolean;
  lastState: OverlayState;
  onAction?: (a: OverlayAction) => void;
  mo?: MutationObserver;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = window as any;

const OVERLAY_CSS = `
:host { all: initial; }
.wrap {
  color: #fff;
  background: #0f172a;
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  padding: 10px 12px;
  width: 260px;
  font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  box-sizing: border-box;
}
.wrap.min {
  width: auto;
  padding: 6px 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.title {
  font-weight: 600;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex: none;
}
.ok { background: #22c55e; }
.warn { background: #f59e0b; }
.off { background: #ef4444; }
.row { margin: 2px 0; }
.muted { opacity: 0.75; }
.btn-row {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
button.min-btn {
  cursor: pointer;
  border: 1px solid #334155;
  background: transparent;
  color: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  font: 600 11px system-ui, -apple-system, sans-serif;
  margin-left: auto;
}
.brand { font-weight: 600; font-size: 11px; }
`;

function removeLegacyElements(): void {
  for (const id of LEGACY_HOST_IDS) {
    const el = document.getElementById(id);
    if (el && el.id !== HOST_ID) el.remove();
  }
}

function escapeText(s: string): string {
  return String(s ?? "");
}

function getOrCreateHost(): OverlayInternal {
  removeLegacyElements();

  const existing = w.__rt_overlay as OverlayInternal | undefined;
  if (existing && document.contains(existing.host) && existing.shadow) {
    return existing;
  }

  // Если старый host по какой-то причине живёт в DOM, но не в w — вычищаем.
  const dom = document.getElementById(HOST_ID);
  if (dom) dom.remove();

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute(
    "style",
    [
      "all: initial",
      "position: fixed",
      "right: 16px",
      "top: 16px",
      "z-index: 2147483647",
      "pointer-events: auto",
    ].join(";"),
  );
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  // Стили — только через textContent отдельного <style>.
  const styleEl = document.createElement("style");
  styleEl.textContent = OVERLAY_CSS;
  shadow.appendChild(styleEl);

  // UI монтируется в отдельный контейнер, никогда не в тот же элемент,
  // куда потенциально может попасть текст.
  const uiRoot = document.createElement("div");
  uiRoot.setAttribute("data-rt-ui-root", "");
  shadow.appendChild(uiRoot);

  const state: OverlayInternal = {
    host, shadow, styleEl, uiRoot,
    minimized: false, lastState: {},
  };
  w.__rt_overlay = state;

  // Защита от удаления страничным SPA-роутером.
  try {
    const mo = new MutationObserver(() => {
      if (!document.getElementById(HOST_ID)) {
        try { document.documentElement.appendChild(host); } catch { /* ignore */ }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: false });
    state.mo = mo;
  } catch { /* ignore */ }

  return state;
}

function buildMinimized(s: OverlayInternal): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "wrap min";
  wrap.title = "Радиус Трек · агент";
  const dot = document.createElement("span");
  const conn = s.lastState.connected;
  dot.className = `dot ${conn ? "ok" : conn === false ? "off" : "warn"}`;
  const brand = document.createElement("span");
  brand.className = "brand";
  brand.textContent = "РТ";
  wrap.appendChild(dot);
  wrap.appendChild(brand);
  wrap.addEventListener("click", () => {
    s.minimized = false;
    render(s);
    s.onAction?.("restore");
  });
  return wrap;
}

function buildExpanded(s: OverlayInternal): HTMLElement {
  const st = s.lastState;
  const conn = st.connected;
  const dotCls = conn ? "ok" : conn === false ? "off" : "warn";
  const statusText = st.status
    ?? (conn === true
      ? "Агент подключён"
      : conn === false
        ? "Агент не подключён"
        : "Проверка агента…");

  const wrap = document.createElement("div");
  wrap.className = "wrap";

  const title = document.createElement("div");
  title.className = "title";
  const dot = document.createElement("span");
  dot.className = `dot ${dotCls}`;
  title.appendChild(dot);
  const titleText = document.createElement("span");
  titleText.textContent = "Радиус Трек · агент";
  title.appendChild(titleText);
  if (st.agent_version) {
    const ver = document.createElement("span");
    ver.className = "muted";
    ver.style.fontWeight = "400";
    ver.textContent = ` v${escapeText(st.agent_version)}`;
    title.appendChild(ver);
  }
  wrap.appendChild(title);

  const statusRow = document.createElement("div");
  statusRow.className = "row muted";
  statusRow.textContent = escapeText(statusText);
  wrap.appendChild(statusRow);

  wrap.appendChild(makeRow("Видно грузов:", st.visible_count));
  wrap.appendChild(makeRow("Отправлено:", st.sent_count));
  wrap.appendChild(makeRow("Подходит:", st.suitable_count));

  const btnRow = document.createElement("div");
  btnRow.className = "btn-row";
  const minBtn = document.createElement("button");
  minBtn.className = "min-btn";
  minBtn.type = "button";
  minBtn.textContent = "Свернуть";
  minBtn.addEventListener("click", () => {
    s.minimized = true;
    render(s);
    s.onAction?.("minimize");
  });
  btnRow.appendChild(minBtn);
  wrap.appendChild(btnRow);

  return wrap;
}

function makeRow(label: string, value: number | undefined): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  const lab = document.createTextNode(`${label} `);
  const strong = document.createElement("b");
  strong.textContent = value == null ? "—" : String(value);
  row.appendChild(lab);
  row.appendChild(strong);
  return row;
}

function render(s: OverlayInternal): void {
  // Полностью очищаем uiRoot и монтируем свежий DOM. style не трогаем.
  while (s.uiRoot.firstChild) s.uiRoot.removeChild(s.uiRoot.firstChild);
  s.uiRoot.appendChild(s.minimized ? buildMinimized(s) : buildExpanded(s));
}

export function showOverlay(
  state: OverlayState = {},
  onAction?: (a: OverlayAction) => void,
): void {
  const s = getOrCreateHost();
  if (onAction) s.onAction = onAction;
  s.lastState = { ...s.lastState, ...state };
  render(s);
}

export function updateOverlay(patch: OverlayState): void {
  const existing = w.__rt_overlay as OverlayInternal | undefined;
  if (!existing) return;
  existing.lastState = { ...existing.lastState, ...patch };
  render(existing);
}

export function hideOverlay(): void {
  const existing = w.__rt_overlay as OverlayInternal | undefined;
  if (existing?.mo) { try { existing.mo.disconnect(); } catch { /* ignore */ } }
  document.getElementById(HOST_ID)?.remove();
  try { delete w.__rt_overlay; } catch { w.__rt_overlay = undefined; }
  removeLegacyElements();
}

// Экспортируем для тестов.
export const __internal = { HOST_ID, LEGACY_HOST_IDS, OVERLAY_CSS };
