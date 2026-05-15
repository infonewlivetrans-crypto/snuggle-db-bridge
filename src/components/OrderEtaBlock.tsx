/**
 * Временно отключено: блок делал прямые запросы в Supabase REST
 * (route_points / routes / delivery_routes), которые на production
 * отдают 400. До отдельной миграции на /api/* блок ничего не рендерит
 * и не делает сетевых запросов.
 */
export function OrderEtaBlock(_props: { orderId: string }) {
  return null;
}
