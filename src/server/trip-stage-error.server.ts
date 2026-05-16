// Маркеры user-facing ошибок trip-stage (нужны, чтобы API-роуты могли
// маппить их в 400 вместо 500 и не засорять worker-логи как server error).
const USER_ERROR_MARKERS = [
  "Маршрут не найден",
  "Недопустимый переход",
  "Недопустимый этап",
  "Укажите причину возврата",
  "deliveryRouteId обязателен",
];

export function tripStageStatusFor(err: unknown): number {
  const msg = (err as Error)?.message ?? "";
  return USER_ERROR_MARKERS.some((m) => msg.includes(m)) ? 400 : 500;
}
