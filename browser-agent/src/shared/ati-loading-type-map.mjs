// Карта типов загрузки ATI.
export const ATI_LOADING_TYPE_MAP = {
  rear: ["задняя"],
  side: ["боковая"],
  top: ["верхняя"],
  full_tent_removal: ["полная растентовка", "растентовка"],
  crossbars_removal: ["со снятием перекладин", "снятие перекладин"],
  posts_removal: ["со снятием стоек", "снятие стоек"],
  no_gates: ["без ворот"],
  hydroboard: ["гидроборт"],
  ramps: ["аппарели"],
  grid: ["обрешётка", "обрешетка"],
};

export function matchAtiLoadingType(labelText) {
  const t = String(labelText || "").trim().toLowerCase();
  if (!t) return null;
  for (const [key, aliases] of Object.entries(ATI_LOADING_TYPE_MAP)) {
    if (aliases.some((a) => t === a || t.includes(a))) return key;
  }
  return null;
}
