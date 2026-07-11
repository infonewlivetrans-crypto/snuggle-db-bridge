// Карта типов кузова ATI — pure ESM, используется и в тестах, и в TS.
// Ключ — канонический тип из search task. Значение — массив альтернативных
// подписей, встречающихся в UI ATI (нижний регистр, без диакритики).

export const ATI_BODY_TYPE_MAP = {
  tent: ["тент", "тентованный", "тентованные"],
  van: ["фургон", "фургоны"],
  all_metal: ["цельнометаллический", "цельнометалл"],
  container: ["контейнер", "контейнеры"],
  isotherm: ["изотермический", "изотерм"],
  refrigerator: ["рефрижератор", "реф", "рефы"],
  onboard: ["бортовой", "борт"],
  open: ["открытый", "открытая"],
  shalanda: ["шаланда"],
  low_frame: ["низкорамный", "низкорамник", "трал"],
  dumper: ["самосвал"],
  tank: ["цистерна"],
  jumbo: ["джамбо"],
  autotransporter: ["автовоз"],
};

export function matchAtiBodyType(labelText) {
  const t = String(labelText || "").trim().toLowerCase();
  if (!t) return null;
  for (const [key, aliases] of Object.entries(ATI_BODY_TYPE_MAP)) {
    if (aliases.some((a) => t === a || t.includes(a))) return key;
  }
  return null;
}
