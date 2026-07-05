// Централизованные "мягкие" селекторы формы поиска ATI.
// Не жёсткие CSS-классы — стратегии по aria-label, name, placeholder, data-*.

export interface FieldStrategy {
  /** Логическое имя поля из ati_filters_json. */
  field: string;
  /** Список кандидатов селекторов, испытываются по порядку. */
  selectors: string[];
  /** Дополнительные текстовые метки для поиска по label→input. */
  labelKeywords?: string[];
  /** Тип элемента: input / select / combo / number. */
  kind?: "input" | "select" | "combo" | "number" | "date";
}

export const FORM_FIELDS: FieldStrategy[] = [
  { field: "pickup_city", kind: "combo",
    selectors: ['input[name*="from" i]', 'input[aria-label*="откуда" i]', 'input[placeholder*="откуда" i]'],
    labelKeywords: ["откуда", "погрузка", "from"] },
  { field: "pickup_radius_km", kind: "number",
    selectors: ['input[name*="from_radius" i]', 'input[aria-label*="радиус погрузки" i]'],
    labelKeywords: ["радиус погрузки"] },
  { field: "delivery_city", kind: "combo",
    selectors: ['input[name*="to" i]', 'input[aria-label*="куда" i]', 'input[placeholder*="куда" i]'],
    labelKeywords: ["куда", "выгрузка", "to"] },
  { field: "delivery_radius_km", kind: "number",
    selectors: ['input[name*="to_radius" i]', 'input[aria-label*="радиус выгрузки" i]'],
    labelKeywords: ["радиус выгрузки"] },
  { field: "distance_min_km", kind: "number",
    selectors: ['input[name*="distance_min" i]', 'input[aria-label*="мин" i][aria-label*="расст" i]'],
    labelKeywords: ["минимальное расстояние"] },
  { field: "distance_max_km", kind: "number",
    selectors: ['input[name*="distance_max" i]', 'input[aria-label*="макс" i][aria-label*="расст" i]'],
    labelKeywords: ["максимальное расстояние"] },
  { field: "weight", kind: "number",
    selectors: ['input[name*="weight" i]', 'input[aria-label*="вес" i]'],
    labelKeywords: ["вес", "тонн"] },
  { field: "volume", kind: "number",
    selectors: ['input[name*="volume" i]', 'input[aria-label*="объ" i]'],
    labelKeywords: ["объём", "объем", "м3"] },
  { field: "pickup_date", kind: "date",
    selectors: ['input[name*="date" i]', 'input[type="date"]', 'input[aria-label*="дата загрузки" i]'],
    labelKeywords: ["дата загрузки", "погрузка"] },
  { field: "body_type", kind: "combo",
    selectors: ['input[name*="body" i]', 'select[name*="body" i]', 'input[aria-label*="кузов" i]'],
    labelKeywords: ["тип кузова", "кузов"] },
  { field: "loading_type", kind: "combo",
    selectors: ['input[name*="loading" i]', 'select[name*="loading" i]', 'input[aria-label*="загрузк" i]'],
    labelKeywords: ["тип загрузки"] },
  { field: "payment_type", kind: "combo",
    selectors: ['input[name*="payment" i]', 'select[name*="payment" i]', 'input[aria-label*="оплат" i]'],
    labelKeywords: ["форма оплаты", "оплата"] },
  { field: "price_min", kind: "number",
    selectors: ['input[name*="price_min" i]', 'input[aria-label*="мин" i][aria-label*="ставк" i]'],
    labelKeywords: ["минимальная ставка", "мин. ставка"] },
  { field: "price_per_km_min", kind: "number",
    selectors: ['input[name*="ppkm" i]', 'input[name*="price_per_km" i]', 'input[aria-label*="за км" i]'],
    labelKeywords: ["ставка за км", "за километр"] },
];

export function findFieldElement(strategy: FieldStrategy, root: ParentNode = document): HTMLElement | null {
  for (const sel of strategy.selectors) {
    try {
      const el = root.querySelector(sel) as HTMLElement | null;
      if (el) return el;
    } catch { /* invalid selector — skip */ }
  }
  if (strategy.labelKeywords?.length) {
    const labels = Array.from(root.querySelectorAll("label"));
    for (const kw of strategy.labelKeywords) {
      const lk = kw.toLowerCase();
      const label = labels.find((l) => (l.textContent ?? "").toLowerCase().includes(lk));
      if (label) {
        const forId = label.getAttribute("for");
        if (forId) {
          const el = document.getElementById(forId);
          if (el) return el as HTMLElement;
        }
        const el = label.querySelector("input,select,textarea");
        if (el) return el as HTMLElement;
      }
    }
  }
  return null;
}
