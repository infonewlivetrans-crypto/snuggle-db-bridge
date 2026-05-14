/**
 * Расширенный модуль склада: часы работы, перерывы, сотрудники,
 * расписание окон загрузки/приёмки (dock slots).
 *
 * Источник правды по структуре БД: миграция 20260427-warehouse-module.
 */

export type WeekDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const WEEK_DAYS: WeekDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const WEEK_DAY_LABELS: Record<WeekDay, string> = {
  mon: "Пн",
  tue: "Вт",
  wed: "Ср",
  thu: "Чт",
  fri: "Пт",
  sat: "Сб",
  sun: "Вс",
};

export const WEEK_DAY_LABELS_FULL: Record<WeekDay, string> = {
  mon: "Понедельник",
  tue: "Вторник",
  wed: "Среда",
  thu: "Четверг",
  fri: "Пятница",
  sat: "Суббота",
  sun: "Воскресенье",
};

export type WorkingHoursDay = {
  enabled: boolean;
  /** "HH:MM" */
  open: string;
  /** "HH:MM" */
  close: string;
};

export type WorkingHours = Record<WeekDay, WorkingHoursDay>;

export type Break = {
  label: string;
  /** "HH:MM" */
  start: string;
  /** "HH:MM" */
  end: string;
};

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  mon: { enabled: true, open: "08:00", close: "18:00" },
  tue: { enabled: true, open: "08:00", close: "18:00" },
  wed: { enabled: true, open: "08:00", close: "18:00" },
  thu: { enabled: true, open: "08:00", close: "18:00" },
  fri: { enabled: true, open: "08:00", close: "18:00" },
  sat: { enabled: false, open: "09:00", close: "14:00" },
  sun: { enabled: false, open: "09:00", close: "14:00" },
};

export const DEFAULT_BREAKS: Break[] = [{ label: "Обед", start: "12:00", end: "13:00" }];

/** Полный тип склада с расширенными полями (после миграции) */
export type WarehouseFull = {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  contact_person: string | null;
  is_active: boolean;
  latitude: number | null;
  longitude: number | null;
  working_hours: WorkingHours;
  breaks: Break[];
  delivery_zone: string | null;
  delivery_radius_km: number | null;
  manager_name: string | null;
  manager_phone: string | null;
  notes: string | null;
  source: string;
  external_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WarehouseStaffRole = "manager" | "storekeeper";

export const STAFF_ROLE_LABELS: Record<WarehouseStaffRole, string> = {
  manager: "Начальник склада",
  storekeeper: "Кладовщик",
};

export type WarehouseStaff = {
  id: string;
  warehouse_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: WarehouseStaffRole;
  is_active: boolean;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

// =================== Утилиты ===================

/** Безопасно прочитать working_hours из jsonb (с дефолтами) */
export function parseWorkingHours(raw: unknown): WorkingHours {
  if (!raw || typeof raw !== "object") return DEFAULT_WORKING_HOURS;
  const r = raw as Partial<Record<WeekDay, Partial<WorkingHoursDay>>>;
  const out = {} as WorkingHours;
  for (const d of WEEK_DAYS) {
    const v = r[d];
    out[d] = {
      enabled: typeof v?.enabled === "boolean" ? v.enabled : DEFAULT_WORKING_HOURS[d].enabled,
      open: typeof v?.open === "string" ? v.open : DEFAULT_WORKING_HOURS[d].open,
      close: typeof v?.close === "string" ? v.close : DEFAULT_WORKING_HOURS[d].close,
    };
  }
  return out;
}

export function parseBreaks(raw: unknown): Break[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (b): b is Break =>
        !!b &&
        typeof b === "object" &&
        typeof (b as Break).label === "string" &&
        typeof (b as Break).start === "string" &&
        typeof (b as Break).end === "string",
    )
    .map((b) => ({ label: b.label, start: b.start, end: b.end }));
}

/** День недели для Date (понедельник = mon) */
export function weekDayOf(d: Date): WeekDay {
  // JS: 0=Sunday..6=Saturday → нужно mon=0..sun=6
  const map: WeekDay[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[d.getDay()];
}

/** Открыт ли склад в указанный момент */
export function isWarehouseOpen(
  hours: WorkingHours,
  breaks: Break[],
  now: Date = new Date(),
): boolean {
  const day = hours[weekDayOf(now)];
  if (!day.enabled) return false;
  const t = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (t < day.open || t >= day.close) return false;
  for (const b of breaks) {
    if (t >= b.start && t < b.end) return false;
  }
  return true;
}

/** Краткая строка часов работы для карточки склада */
export function workingHoursSummary(hours: WorkingHours): string {
  // Группируем подряд идущие одинаковые дни
  const parts: string[] = [];
  let i = 0;
  while (i < WEEK_DAYS.length) {
    const d = WEEK_DAYS[i];
    if (!hours[d].enabled) {
      i++;
      continue;
    }
    let j = i;
    while (
      j + 1 < WEEK_DAYS.length &&
      hours[WEEK_DAYS[j + 1]].enabled &&
      hours[WEEK_DAYS[j + 1]].open === hours[d].open &&
      hours[WEEK_DAYS[j + 1]].close === hours[d].close
    ) {
      j++;
    }
    const range =
      i === j
        ? WEEK_DAY_LABELS[WEEK_DAYS[i]]
        : `${WEEK_DAY_LABELS[WEEK_DAYS[i]]}–${WEEK_DAY_LABELS[WEEK_DAYS[j]]}`;
    parts.push(`${range} ${hours[d].open}–${hours[d].close}`);
    i = j + 1;
  }
  return parts.length ? parts.join(", ") : "Закрыт";
}
