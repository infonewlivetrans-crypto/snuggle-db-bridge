// Pure trip status helpers for AI-dispatcher driver flow.
// No imports from server / supabase — safe in both browser and node.

export type TripStatus =
  | "assigned"
  | "to_pickup"
  | "at_pickup"
  | "loaded"
  | "to_dropoff"
  | "at_dropoff"
  | "unloaded"
  | "delivered"
  | "cancelled";

export type TripPointKind = "pickup" | "dropoff" | "waypoint";
export type TripPointStatus = "pending" | "arrived" | "done" | "skipped";

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  assigned: "Назначен",
  to_pickup: "Едет на загрузку",
  at_pickup: "На загрузке",
  loaded: "Загружен",
  to_dropoff: "Едет на выгрузку",
  at_dropoff: "На выгрузке",
  unloaded: "Выгружен",
  delivered: "Завершён",
  cancelled: "Отменён",
};

export const TRIP_STATUS_BADGE: Record<TripStatus, string> = {
  assigned: "bg-muted text-foreground",
  to_pickup: "bg-blue-100 text-blue-800",
  at_pickup: "bg-blue-200 text-blue-900",
  loaded: "bg-amber-100 text-amber-800",
  to_dropoff: "bg-indigo-100 text-indigo-800",
  at_dropoff: "bg-indigo-200 text-indigo-900",
  unloaded: "bg-emerald-100 text-emerald-800",
  delivered: "bg-emerald-200 text-emerald-900",
  cancelled: "bg-rose-100 text-rose-800",
};

export type TripPoint = {
  id: string;
  idx: number;
  kind: TripPointKind;
  city: string | null;
  address: string | null;
  status: TripPointStatus;
};

/**
 * Returns the next action the driver should perform, given current trip
 * status and the ordered list of points. Returns null when no next action
 * is available (trip already delivered/cancelled).
 */
export function nextDriverAction(
  status: TripStatus,
  points: TripPoint[],
): { next: TripStatus; label: string; pointId: string | null } | null {
  if (status === "delivered" || status === "cancelled") return null;

  const pickups = points.filter((p) => p.kind === "pickup");
  const dropoffs = points.filter((p) => p.kind === "dropoff");
  const nextPickup = pickups.find((p) => p.status !== "done");
  const nextDropoff = dropoffs.find((p) => p.status !== "done");

  switch (status) {
    case "assigned":
      return {
        next: "to_pickup",
        label: "Поехал на загрузку",
        pointId: nextPickup?.id ?? null,
      };
    case "to_pickup":
      return {
        next: "at_pickup",
        label: "Я на загрузке",
        pointId: nextPickup?.id ?? null,
      };
    case "at_pickup":
      return {
        next: "loaded",
        label: "Загрузился",
        pointId: nextPickup?.id ?? null,
      };
    case "loaded": {
      // If more pickups remain, go back to to_pickup for next pickup.
      const remainingPickups = pickups.filter((p) => p.status !== "done").length;
      if (remainingPickups > 0) {
        return {
          next: "to_pickup",
          label: "Поехал на следующую загрузку",
          pointId: nextPickup?.id ?? null,
        };
      }
      return {
        next: "to_dropoff",
        label: "Поехал на выгрузку",
        pointId: nextDropoff?.id ?? null,
      };
    }
    case "to_dropoff":
      return {
        next: "at_dropoff",
        label: "Я на выгрузке",
        pointId: nextDropoff?.id ?? null,
      };
    case "at_dropoff":
      return {
        next: "unloaded",
        label: "Выгрузился",
        pointId: nextDropoff?.id ?? null,
      };
    case "unloaded": {
      const remainingDropoffs = dropoffs.filter((p) => p.status !== "done").length;
      if (remainingDropoffs > 0) {
        return {
          next: "to_dropoff",
          label: "Поехал на следующую выгрузку",
          pointId: nextDropoff?.id ?? null,
        };
      }
      return { next: "delivered", label: "Сдал груз / завершить рейс", pointId: null };
    }
    default:
      return null;
  }
}

const LEGAL: Record<TripStatus, TripStatus[]> = {
  assigned: ["to_pickup", "cancelled"],
  to_pickup: ["at_pickup", "cancelled"],
  at_pickup: ["loaded", "cancelled"],
  loaded: ["to_pickup", "to_dropoff", "cancelled"],
  to_dropoff: ["at_dropoff", "cancelled"],
  at_dropoff: ["unloaded", "cancelled"],
  unloaded: ["to_dropoff", "delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function isLegalTransition(from: TripStatus, to: TripStatus): boolean {
  return LEGAL[from].includes(to);
}
