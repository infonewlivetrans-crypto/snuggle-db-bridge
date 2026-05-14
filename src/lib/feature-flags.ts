// Реестр feature flags. Только описание и значения по умолчанию.
// База не меняется — этот файл служит источником правды для UI настроек
// и для безопасного отключения незавершённых блоков через <Feature>.
//
// Все флаги по умолчанию выключены (enabled=false) и помечены как
// экспериментальные — при включении админ увидит предупреждение.

export type FeatureFlagCategory =
  | "drivers"
  | "logists"
  | "managers"
  | "routes"
  | "notifications"
  | "gps"
  | "qr"
  | "offline"
  | "ai"
  | "experimental";

export const CATEGORY_LABELS: Record<FeatureFlagCategory, string> = {
  drivers: "Водители",
  logists: "Логисты",
  managers: "Менеджеры",
  routes: "Маршруты",
  notifications: "Уведомления",
  gps: "GPS и геолокация",
  qr: "QR-коды",
  offline: "Офлайн-режим",
  ai: "AI и автоматизация",
  experimental: "Тестовые возможности",
};

export type FeatureRollout = "off" | "admins" | "testers" | "roles" | "all";

export interface FeatureFlagDefinition {
  /** Стабильный ключ, например "driver.offline_mode". Не менять после релиза. */
  key: string;
  /** Краткое название для UI. */
  name: string;
  /** Что делает фича. Показывается админу. */
  description: string;
  category: FeatureFlagCategory;
  /** Значение по умолчанию, если в БД ещё нет записи. */
  defaultEnabled: boolean;
  defaultRollout: FeatureRollout;
  /** Роли, для которых фича включается при rollout="roles". */
  defaultAllowedRoles?: string[];
  /** Экспериментальная — показывать предупреждение в админке. */
  experimental: boolean;
}

export const FEATURE_FLAGS: FeatureFlagDefinition[] = [
  // Водители
  {
    key: "driver.offline_mode",
    name: "Офлайн-режим водителя",
    description: "Сохранение действий и фото без связи и отправка при восстановлении сети.",
    category: "drivers",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },
  {
    key: "driver.cargo_features_banner",
    name: "Баннер особенностей груза",
    description: "Показ важных предупреждений по грузу перед началом разгрузки.",
    category: "drivers",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },
  {
    key: "driver.photo_compression",
    name: "Сжатие фото",
    description: "Автоматическое сжатие фото перед загрузкой для экономии трафика.",
    category: "drivers",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },

  // Логисты
  {
    key: "logist.important_comment_change_warning",
    name: "Предупреждение об изменении важного комментария",
    description: "Уведомление логисту, если важный комментарий заказа изменён во время маршрута.",
    category: "logists",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },
  {
    key: "logist.cargo_features_highlight",
    name: "Подсветка особенностей груза",
    description: "Выделение ключевых особенностей в комментариях заказа в списке и карточках.",
    category: "logists",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },

  // Менеджеры
  {
    key: "manager.bulk_import",
    name: "Массовый импорт",
    description: "Загрузка большого количества заказов и клиентов из Excel.",
    category: "managers",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },

  // Маршруты
  {
    key: "routes.auto_optimization",
    name: "Автооптимизация маршрута",
    description: "Автоматическое построение оптимального порядка точек разгрузки.",
    category: "routes",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },
  {
    key: "routes.unloading_order_warning",
    name: "Предупреждение о порядке разгрузки",
    description: "Подтверждение при изменении порядка точек с особенностями груза.",
    category: "routes",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },

  // Уведомления
  {
    key: "notifications.push",
    name: "Push-уведомления",
    description: "Доставка уведомлений в браузер и мобильное устройство.",
    category: "notifications",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },
  {
    key: "notifications.sound",
    name: "Звуковые оповещения",
    description: "Проигрывание звука при новых заказах и важных событиях.",
    category: "notifications",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },

  // GPS
  {
    key: "gps.driver_tracking",
    name: "Отслеживание водителя",
    description: "Передача и отображение координат водителя на маршруте.",
    category: "gps",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },
  {
    key: "gps.eta_calculation",
    name: "Расчёт ETA",
    description: "Прогноз времени прибытия по координатам и пробкам.",
    category: "gps",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },

  // QR
  {
    key: "qr.point_check_in",
    name: "QR-отметка на точке",
    description: "Подтверждение прибытия и разгрузки по QR-коду.",
    category: "qr",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },
  {
    key: "qr.driver_invite",
    name: "QR-приглашение водителя",
    description: "Передача инвайт-ссылки водителю через QR-код.",
    category: "qr",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },

  // Офлайн
  {
    key: "offline.queue",
    name: "Очередь офлайн-операций",
    description: "Сохранение запросов без связи и автоматическая повторная отправка.",
    category: "offline",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },

  // AI
  {
    key: "ai.cargo_feature_detection",
    name: "AI-распознавание особенностей груза",
    description: "Использование AI для извлечения особенностей из произвольного комментария.",
    category: "ai",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },
  {
    key: "ai.route_assistant",
    name: "AI-ассистент по маршруту",
    description: "Подсказки логисту по построению и корректировке маршрутов.",
    category: "ai",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },

  // Тестовые
  {
    key: "experimental.beta_ui",
    name: "Бета-интерфейс",
    description: "Включение незавершённых элементов нового интерфейса для тест-пользователей.",
    category: "experimental",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },
  {
    key: "experimental.debug_panel",
    name: "Панель отладки",
    description: "Дополнительная диагностическая панель для разработчиков и тестировщиков.",
    category: "experimental",
    defaultEnabled: false,
    defaultRollout: "off",
    experimental: true,
  },
];

export const FEATURE_FLAGS_BY_KEY: Record<string, FeatureFlagDefinition> = Object.fromEntries(
  FEATURE_FLAGS.map((f) => [f.key, f]),
);

export function getFeatureFlagsByCategory(): Record<FeatureFlagCategory, FeatureFlagDefinition[]> {
  const out = {} as Record<FeatureFlagCategory, FeatureFlagDefinition[]>;
  for (const cat of Object.keys(CATEGORY_LABELS) as FeatureFlagCategory[]) {
    out[cat] = FEATURE_FLAGS.filter((f) => f.category === cat);
  }
  return out;
}
