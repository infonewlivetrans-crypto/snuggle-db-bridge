// Распознавание особенностей груза по тексту комментариев заказа.
// Ничего не меняет в БД — анализ происходит на клиенте по уже существующим
// полям `comment` и `driver_comment`.

export type CargoFeatureKey =
  | "unload_last"
  | "load_bottom"
  | "fragile"
  | "top_loading"
  | "manual_unload"
  | "pallets"
  | "sheets"
  | "do_not_tilt"
  | "strict_time"
  | "checkpoint"
  | "call_ahead";

export type CargoFeature = {
  key: CargoFeatureKey;
  /** Короткая метка для бейджа: «выгружать последним», «КПП»... */
  label: string;
  /** Расширенное предупреждение водителю. */
  driverWarning: string;
  /** Предупреждение логисту при изменении порядка/настройке. */
  logistWarning: string;
  /** true — критично, подсвечивать как destructive. */
  critical: boolean;
};

const RULES: Array<{ feature: CargoFeature; patterns: RegExp[] }> = [
  {
    feature: {
      key: "unload_last",
      label: "выгружать последним",
      driverWarning: "Важно: груз находится внизу, выгружать последним.",
      logistWarning: "У заказа есть особенность: груз должен выгружаться последним.",
      critical: true,
    },
    patterns: [/выгру[жз]\w*\s+последн/i, /последн\w*\s+выгру/i],
  },
  {
    feature: {
      key: "load_bottom",
      label: "грузить вниз",
      driverWarning: "Важно: грузить/располагать вниз кузова.",
      logistWarning: "Заказ нужно грузить вниз — учитывать при порядке погрузки.",
      critical: true,
    },
    patterns: [/гру[жз]\w*\s+вниз/i, /вниз\w*\s+гру[жз]/i, /снизу/i],
  },
  {
    feature: {
      key: "fragile",
      label: "хрупкое",
      driverWarning: "Важно: хрупкий груз — аккуратная перевозка и выгрузка.",
      logistWarning: "Хрупкий груз — учитывать при размещении и порядке.",
      critical: true,
    },
    patterns: [/хрупк/i],
  },
  {
    feature: {
      key: "top_loading",
      label: "верхняя загрузка",
      driverWarning: "Особенность: верхняя загрузка/выгрузка.",
      logistWarning: "Верхняя загрузка — проверьте тип ТС.",
      critical: false,
    },
    patterns: [/верхн\w*\s+(загруз|выгруз|погруз)/i],
  },
  {
    feature: {
      key: "manual_unload",
      label: "ручная выгрузка",
      driverWarning: "Важно: ручная выгрузка.",
      logistWarning: "Ручная выгрузка — учесть время на точке.",
      critical: false,
    },
    patterns: [/ручн\w*\s+(выгруз|погруз|загруз)/i],
  },
  {
    feature: {
      key: "pallets",
      label: "паллеты",
      driverWarning: "Особенность: груз на паллетах.",
      logistWarning: "Груз на паллетах — нужен подходящий способ выгрузки.",
      critical: false,
    },
    patterns: [/паллет/i, /паллеты/i, /pallet/i],
  },
  {
    feature: {
      key: "sheets",
      label: "листы",
      driverWarning: "Особенность: листовой груз.",
      logistWarning: "Листовой груз — учитывать при размещении.",
      critical: false,
    },
    patterns: [/\bлист[аыов]?\b/i],
  },
  {
    feature: {
      key: "do_not_tilt",
      label: "не кантовать",
      driverWarning: "Важно: не кантовать!",
      logistWarning: "Груз нельзя кантовать — учитывать при размещении.",
      critical: true,
    },
    patterns: [/не\s+кантов/i, /не\s*канту/i],
  },
  {
    feature: {
      key: "strict_time",
      label: "строго по времени",
      driverWarning: "Важно: прибыть строго в окно доставки.",
      logistWarning: "Заказ строго по времени — нельзя сдвигать без согласования.",
      critical: true,
    },
    patterns: [/строго\s+по\s+времени/i, /строго\s+к\s+\d/i],
  },
  {
    feature: {
      key: "checkpoint",
      label: "КПП",
      driverWarning: "Въезд через КПП — заранее уточнить пропуск.",
      logistWarning: "Въезд через КПП — уточнить пропуск/документы.",
      critical: false,
    },
    patterns: [/\bкпп\b/i, /пропуск/i],
  },
  {
    feature: {
      key: "call_ahead",
      label: "созвон заранее",
      driverWarning: "Важно: позвонить клиенту заранее.",
      logistWarning: "Требуется звонок клиенту заранее.",
      critical: false,
    },
    patterns: [/созвон/i, /позвон\w*\s+(за|заранее)/i, /звонок\s+за\s+\d/i],
  },
];

/** Извлекает уникальные особенности груза из набора текстов. */
export function detectCargoFeatures(...texts: Array<string | null | undefined>): CargoFeature[] {
  const haystack = texts.filter(Boolean).join("\n");
  if (!haystack) return [];
  const seen = new Set<CargoFeatureKey>();
  const out: CargoFeature[] = [];
  for (const { feature, patterns } of RULES) {
    if (seen.has(feature.key)) continue;
    if (patterns.some((p) => p.test(haystack))) {
      seen.add(feature.key);
      out.push(feature);
    }
  }
  return out;
}

export function hasCriticalFeature(features: CargoFeature[]): boolean {
  return features.some((f) => f.critical);
}
