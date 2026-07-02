// Radius Track Browser Agent — content script (skeleton).
// Читает только ВИДИМУЮ выдачу на странице ati.su, куда пользователь уже вошёл.
// Никакого API ATI, никаких скрытых запросов, никакого обхода защиты.
export {};

function readVisibleLoads(): unknown[] {
  // TODO: селекторы к DOM видимой страницы поиска и извлечение основных полей.
  return [];
}

window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  const data = e.data as { rt?: string } | null;
  if (!data || data.rt !== "read_visible_loads") return;
  const loads = readVisibleLoads();
  // TODO: отправить в background -> POST /api/public/agent/ai-dispatcher/loads
  console.log("[radius-track-agent] visible loads", loads.length);
});
