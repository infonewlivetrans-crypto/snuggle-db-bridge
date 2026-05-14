export type RequestPriority = "low" | "medium" | "high" | "urgent";

export const PRIORITY_LABELS: Record<RequestPriority, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  urgent: "Срочно",
};

export const PRIORITY_BADGE_CLASS: Record<RequestPriority, string> = {
  low: "bg-muted text-muted-foreground border-border",
  medium: "bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-800",
  high: "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-800",
  urgent: "bg-red-100 text-red-900 border-red-300 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800",
};

export const PRIORITY_ORDER: RequestPriority[] = ["low", "medium", "high", "urgent"];
