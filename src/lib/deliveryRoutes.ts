export type DeliveryRouteStatus = "draft" | "formed" | "in_progress" | "completed";

export const DELIVERY_ROUTE_STATUS_LABELS: Record<DeliveryRouteStatus, string> = {
  draft: "Черновик",
  formed: "Сформирован",
  in_progress: "В работе",
  completed: "Завершён",
};

export const DELIVERY_ROUTE_STATUS_ORDER: DeliveryRouteStatus[] = [
  "draft",
  "formed",
  "in_progress",
  "completed",
];

export const DELIVERY_ROUTE_STATUS_STYLES: Record<DeliveryRouteStatus, string> = {
  draft: "bg-slate-100 text-slate-900 border-slate-200 dark:bg-slate-900/40 dark:text-slate-200",
  formed: "bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200",
  in_progress: "bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200",
  completed: "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200",
};
