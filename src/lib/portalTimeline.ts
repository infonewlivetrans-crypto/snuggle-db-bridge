import {
  PackagePlus,
  Truck,
  Navigation,
  MapPin,
  CheckCircle2,
  XCircle,
  Undo2,
  PackageCheck,
  Ban,
  Circle,
  type LucideIcon,
} from "lucide-react";

export type PortalTimelineKind =
  | "order_created"
  | "dispatched"
  | "driver_en_route"
  | "driver_arrived"
  | "delivered"
  | "not_delivered"
  | "returned_to_warehouse"
  | "warehouse_accepted"
  | "cancelled";

export type PortalTimelineEvent = {
  kind: PortalTimelineKind | string;
  occurred_at: string;
  payload: Record<string, unknown>;
};

export type PortalTimelineMeta = {
  label: string;
  icon: LucideIcon;
  tone: "neutral" | "info" | "progress" | "success" | "warning" | "danger";
};

export const PORTAL_TIMELINE_META: Record<PortalTimelineKind, PortalTimelineMeta> = {
  order_created:         { label: "Заказ создан",           icon: PackagePlus,  tone: "neutral"  },
  dispatched:            { label: "Передан в доставку",     icon: Truck,        tone: "info"     },
  driver_en_route:       { label: "Водитель выехал к вам",  icon: Navigation,   tone: "progress" },
  driver_arrived:        { label: "Водитель на месте",      icon: MapPin,       tone: "progress" },
  delivered:             { label: "Заказ доставлен",        icon: CheckCircle2, tone: "success"  },
  not_delivered:         { label: "Заказ не доставлен",     icon: XCircle,      tone: "warning"  },
  returned_to_warehouse: { label: "Возвращён на склад",     icon: Undo2,        tone: "warning"  },
  warehouse_accepted:    { label: "Принят на складе",       icon: PackageCheck, tone: "neutral"  },
  cancelled:             { label: "Заказ отменён",          icon: Ban,          tone: "danger"   },
};

export function getPortalTimelineMeta(kind: string): PortalTimelineMeta {
  return (
    PORTAL_TIMELINE_META[kind as PortalTimelineKind] ?? {
      label: "Событие",
      icon: Circle,
      tone: "neutral",
    }
  );
}

export const PORTAL_TIMELINE_TONE_CLASSES: Record<PortalTimelineMeta["tone"], string> = {
  neutral:  "bg-muted text-muted-foreground",
  info:     "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200",
  progress: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200",
  success:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  warning:  "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  danger:   "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
};

export function formatPortalEventDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
