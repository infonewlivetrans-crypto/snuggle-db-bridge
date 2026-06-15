/**
 * Справочник зон и крупных направлений по РФ.
 *
 * Хранится как plain-список меток. Зоны и города в БД лежат в одном поле
 * dispatcher_vehicle_ext.ready_to_cities — отличаем по совпадению с этим
 * списком. Никакой отдельной тяжёлой таблицы.
 */

export const RUSSIA_ZONES: ReadonlyArray<{ id: string; label: string; hint?: string }> = [
  { id: "Любое направление", label: "Любое направление", hint: "Готов ехать куда угодно" },
  { id: "Москва и область", label: "Москва и область" },
  { id: "Санкт-Петербург и область", label: "Санкт-Петербург и область" },
  { id: "Центр", label: "Центр", hint: "Центральный ФО" },
  { id: "Юг", label: "Юг", hint: "ЮФО" },
  { id: "Кавказ", label: "Кавказ", hint: "СКФО" },
  { id: "Поволжье", label: "Поволжье", hint: "ПФО" },
  { id: "Урал", label: "Урал", hint: "УрФО" },
  { id: "Сибирь", label: "Сибирь", hint: "СФО" },
  { id: "Северо-Запад", label: "Северо-Запад", hint: "СЗФО" },
  { id: "Дальний Восток", label: "Дальний Восток", hint: "ДФО" },
  { id: "Краснодарский край", label: "Краснодарский край" },
  { id: "Ростовская область", label: "Ростовская область" },
  { id: "Татарстан", label: "Татарстан" },
  { id: "Свердловская область", label: "Свердловская область" },
];

const ZONE_IDS = new Set<string>(RUSSIA_ZONES.map((z) => z.id));

/** true, если строка совпадает с одним из id зон (case-sensitive — id и есть label). */
export function isZoneLabel(value: string): boolean {
  return ZONE_IDS.has(value.trim());
}

/** Разделяет смешанный список ready_to_cities на зоны и обычные города. */
export function splitZonesAndCities(values: ReadonlyArray<string>): {
  zones: string[];
  cities: string[];
} {
  const zones: string[] = [];
  const cities: string[] = [];
  for (const raw of values ?? []) {
    const v = (raw ?? "").trim();
    if (!v) continue;
    if (isZoneLabel(v)) zones.push(v);
    else cities.push(v);
  }
  return { zones, cities };
}
