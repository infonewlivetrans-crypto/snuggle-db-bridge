interface Props {
  orderId: string;
}

/**
 * Временно отключено: запрос напрямую в Supabase REST к таблице
 * order_problem_reports на production отдаёт 400. До отдельной миграции
 * на /api/* блок ничего не рендерит и не делает сетевых запросов.
 */
export function OrderProblemReportsBlock(_props: Props) {
  return null;
}
