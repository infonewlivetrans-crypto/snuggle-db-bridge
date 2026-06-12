// Единый справочник видов транспорта / типов кузова.
// Используется во всех формах и фильтрах AI-диспетчера и кабинета перевозчика.
// Хранится в БД как text (без enum), чтобы не ломать старые значения.

export type VehicleBodyTypeOption = { value: string; label: string };

export const VEHICLE_BODY_TYPES: VehicleBodyTypeOption[] = [
  { value: "tent", label: "Тент" },
  { value: "ref", label: "Рефрижератор" },
  { value: "isothermal", label: "Изотерм" },
  { value: "van", label: "Фургон" },
  { value: "box", label: "Будка" },
  { value: "flatbed", label: "Бортовая" },
  { value: "open_platform", label: "Открытая площадка" },
  { value: "container", label: "Контейнеровоз" },
  { value: "tow_truck", label: "Эвакуатор" },
  { value: "manipulator", label: "Манипулятор" },
  { value: "dump", label: "Самосвал" },
  { value: "cistern", label: "Цистерна" },
  { value: "car_transporter", label: "Автовоз" },
  { value: "low_loader", label: "Низкорамник" },
  { value: "grain_truck", label: "Зерновоз" },
  { value: "livestock", label: "Скотовоз" },
  { value: "other", label: "Другое" },
];

const VALUE_TO_LABEL: Record<string, string> = Object.fromEntries(
  VEHICLE_BODY_TYPES.map((o) => [o.value, o.label]),
);

// Лейблы для устаревших/альтернативных кодов, которые могли попасть в БД ранее.
const LEGACY_LABELS: Record<string, string> = {
  refrigerator: "Рефрижератор",
  board: "Бортовая",
  timber: "Лесовоз",
};

/** Возвращает русский лейбл по коду. Если код не известен — возвращает само значение. */
export function getVehicleBodyTypeLabel(value: string | null | undefined): string {
  if (!value) return "";
  const v = String(value).trim();
  if (!v) return "";
  if (VALUE_TO_LABEL[v]) return VALUE_TO_LABEL[v];
  if (LEGACY_LABELS[v]) return LEGACY_LABELS[v];
  return v;
}

// Нормализация старых значений (включая русский текст) в текущие коды.
// Не трогает БД — используется только при сравнении в подборе грузов/машин.
const NORMALIZE_MAP: Array<{ re: RegExp; code: string }> = [
  { re: /^реф|^ref|холодил|рефриж/i, code: "ref" },
  { re: /изотерм/i, code: "isothermal" },
  { re: /тент/i, code: "tent" },
  { re: /будк/i, code: "box" },
  { re: /фургон|^van|^box$/i, code: "van" },
  { re: /борт|flatbed|шаланд/i, code: "flatbed" },
  { re: /открыт.*площад|open/i, code: "open_platform" },
  { re: /контейнер|container/i, code: "container" },
  { re: /эвакуатор|tow/i, code: "tow_truck" },
  { re: /манипулятор|manipulator/i, code: "manipulator" },
  { re: /самосвал|dump/i, code: "dump" },
  { re: /цистерн|cistern/i, code: "cistern" },
  { re: /автовоз|car_?transport/i, code: "car_transporter" },
  { re: /низкорам|low.?loader|трал/i, code: "low_loader" },
  { re: /зерновоз|grain/i, code: "grain_truck" },
  { re: /скотовоз|livestock/i, code: "livestock" },
  { re: /лесовоз|коник|timber/i, code: "other" },
];

/** Приводит значение body_type (код или русский текст) к коду из VEHICLE_BODY_TYPES. */
export function normalizeVehicleBodyType(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (VALUE_TO_LABEL[v]) return v;
  for (const rule of NORMALIZE_MAP) {
    if (rule.re.test(v)) return rule.code;
  }
  return null;
}
