// Роли пользователей системы
export const APP_ROLES = [
  "admin",
  "director",
  "logist",
  "manager",
  "warehouse",
  "supply",
  "driver",
  "carrier",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Администратор",
  director: "Руководитель",
  logist: "Логист",
  manager: "Менеджер",
  warehouse: "Склад",
  supply: "Снабжение",
  driver: "Водитель",
  carrier: "Перевозчик",
};

// Куда отправлять пользователя после входа (по приоритету)
export function landingPathForRoles(roles: AppRole[]): string {
  if (roles.includes("admin")) return "/";
  if (roles.includes("director")) return "/director";
  if (roles.includes("logist")) return "/logist";
  if (roles.includes("manager")) return "/";
  if (roles.includes("warehouse")) return "/warehouse-today";
  if (roles.includes("supply")) return "/supply";
  if (roles.includes("driver")) return "/driver";
  if (roles.includes("carrier")) return "/carrier-offers";
  return "/";
}

// Какие роли могут открывать тот или иной путь.
// Пустой массив = доступно всем авторизованным.
const RULES: Array<{ test: (p: string) => boolean; roles: AppRole[] }> = [
  { test: (p) => p.startsWith("/admin"), roles: ["admin"] },
  { test: (p) => p.startsWith("/users"), roles: ["admin"] },
  { test: (p) => p.startsWith("/director"), roles: ["admin", "director"] },
  { test: (p) => p.startsWith("/audit-log"), roles: ["admin", "director"] },
  { test: (p) => p.startsWith("/backups"), roles: ["admin", "director"] },
  { test: (p) => p.startsWith("/system-errors"), roles: ["admin", "director"] },
  { test: (p) => p.startsWith("/system-activity"), roles: ["admin", "director"] },
  { test: (p) => p.startsWith("/system-issues") || p.startsWith("/system-test") || p.startsWith("/first-run") || p.startsWith("/pilot"), roles: ["admin"] },
  { test: (p) => p.startsWith("/data-import"), roles: ["admin", "logist", "manager"] },

  { test: (p) => p.startsWith("/logist"), roles: ["admin", "logist"] },
  { test: (p) => p.startsWith("/transport-requests"), roles: ["admin", "logist", "manager"] },
  { test: (p) => p.startsWith("/delivery-routes") || p.startsWith("/routes"), roles: ["admin", "logist", "manager", "director"] },
  { test: (p) => p.startsWith("/route-reports"), roles: ["admin", "logist", "manager", "director"] },

  // Руководитель — только отчёт склада (чтение), без редактирования складских операций
  { test: (p) => p.startsWith("/warehouse-report"), roles: ["admin", "warehouse", "logist", "director"] },
  { test: (p) => p.startsWith("/warehouse"), roles: ["admin", "warehouse", "logist"] },
  { test: (p) => p.startsWith("/supply"), roles: ["admin", "supply"] },

  { test: (p) => p.startsWith("/carriers") || p.startsWith("/drivers") || p.startsWith("/vehicles"), roles: ["admin", "logist", "director"] },

  { test: (p) => p.startsWith("/driver") && !p.startsWith("/drivers"), roles: ["admin", "driver", "carrier"] },
  { test: (p) => p.startsWith("/carrier-offers"), roles: ["admin", "logist", "carrier"] },
  { test: (p) => p.startsWith("/carrier-routes"), roles: ["admin", "logist", "carrier"] },
  { test: (p) => p.startsWith("/carrier-payments"), roles: ["admin", "logist", "director"] },
  { test: (p) => p.startsWith("/d/"), roles: [] }, // публичные ссылки водителя по токену

  { test: (p) => p === "/" || p.startsWith("/?"), roles: ["admin", "manager", "logist", "director"] },
  { test: (p) => p.startsWith("/notifications"), roles: [] },
  { test: (p) => p.startsWith("/workspace"), roles: [] },
  { test: (p) => p.startsWith("/feedback"), roles: [] },
  { test: (p) => p.startsWith("/pilot-tasks"), roles: ["admin", "director"] },
];

export function canAccess(path: string, roles: AppRole[]): boolean {
  if (roles.includes("admin")) return true;
  const rule = RULES.find((r) => r.test(path));
  if (!rule) return true; // нет явного правила — разрешено всем авторизованным
  if (rule.roles.length === 0) return true;
  return rule.roles.some((r) => roles.includes(r));
}
