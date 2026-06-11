import { useEffect, useState } from "react";
import { toast } from "sonner";

export interface TimelineEvent {
  id: string;
  event_type: string;
  event_label: string;
  occurred_at: string;
  actor_id: string | null;
  actor_label: string | null;
  entity_type: string;
  entity_id: string;
  title: string;
  description: string | null;
  status: string | null;
  meta?: Record<string, unknown>;
}

interface Props {
  dealId?: string | null;
  vehicleId?: string | null;
  freightId?: string | null;
  carrierRequestId?: string | null;
  carrierId?: string | null;
  driverId?: string | null;
  title?: string;
}

const fmt = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("ru-RU");
  } catch {
    return iso;
  }
};

export function TimelineBlock({
  dealId,
  vehicleId,
  freightId,
  carrierRequestId,
  carrierId,
  driverId,
  title = "История",
}: Props) {
  const [rows, setRows] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const params = new URLSearchParams();
    if (dealId) params.set("deal_id", dealId);
    if (vehicleId) params.set("vehicle_id", vehicleId);
    if (freightId) params.set("freight_id", freightId);
    if (carrierRequestId) params.set("carrier_request_id", carrierRequestId);
    if (carrierId) params.set("carrier_id", carrierId);
    if (driverId) params.set("driver_id", driverId);
    if ([...params].length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    fetch(`/api/dispatcher/timeline?${params.toString()}`, { credentials: "include" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? "timeline_failed");
        setRows((data?.rows as TimelineEvent[]) ?? []);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Ошибка истории"))
      .finally(() => setLoading(false));
  }, [dealId, vehicleId, freightId, carrierRequestId, carrierId, driverId]);

  if (loading) {
    return <div className="text-xs text-muted-foreground">Загрузка истории…</div>;
  }
  if (rows.length === 0) {
    return <div className="text-xs text-muted-foreground">Событий пока нет.</div>;
  }

  return (
    <div className="space-y-2">
      {title ? <h4 className="text-sm font-semibold">{title}</h4> : null}
      <ol className="space-y-2">
        {rows.map((ev) => {
          const hasDetails = !!ev.description && ev.description.length > 80;
          const open = !!expanded[ev.id];
          const desc =
            hasDetails && !open
              ? ev.description!.slice(0, 80) + "…"
              : ev.description;
          return (
            <li
              key={ev.id}
              className="rounded border bg-card p-2 text-xs"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-medium">{ev.title}</div>
                <div className="text-muted-foreground whitespace-nowrap">
                  {fmt(ev.occurred_at)}
                </div>
              </div>
              {desc ? (
                <div className="mt-1 text-muted-foreground">{desc}</div>
              ) : null}
              <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                {ev.actor_label ? <span>👤 {ev.actor_label}</span> : null}
                {ev.status ? <span>статус: {ev.status}</span> : null}
                {hasDetails ? (
                  <button
                    className="underline"
                    type="button"
                    onClick={() =>
                      setExpanded((p) => ({ ...p, [ev.id]: !p[ev.id] }))
                    }
                  >
                    {open ? "Свернуть" : "Подробнее"}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
