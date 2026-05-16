import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import {
  formatPortalEventDateTime,
  getPortalTimelineMeta,
  PORTAL_TIMELINE_TONE_CLASSES,
  type PortalTimelineEvent,
} from "@/lib/portalTimeline";

type Props = {
  token: string;
  orderId: string;
};

type ApiResponse = { events: PortalTimelineEvent[] };

export function PortalOrderTimelineBlock({ token, orderId }: Props) {
  const q = useQuery({
    queryKey: ["client-portal-timeline", token, orderId],
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<PortalTimelineEvent[]> => {
      const res = await fetch(
        `/api/public/client-portal/${encodeURIComponent(token)}/orders/${encodeURIComponent(orderId)}/timeline`,
        { headers: { accept: "application/json" } },
      );
      if (!res.ok) throw new Error("server");
      const json = (await res.json()) as ApiResponse;
      return json.events ?? [];
    },
  });

  return (
    <section aria-label="История заказа" className="rounded-lg border border-border bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <History className="h-3.5 w-3.5" />
        История заказа
      </div>

      {q.isLoading ? (
        <ul className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3">
              <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted/70" />
              </div>
            </li>
          ))}
        </ul>
      ) : q.isError ? (
        <div className="text-sm text-muted-foreground">
          История пока недоступна. Попробуйте обновить страницу позже.
        </div>
      ) : !q.data || q.data.length === 0 ? (
        <div className="text-sm italic text-muted-foreground">Пока нет событий</div>
      ) : (
        <ol className="space-y-3">
          {q.data.map((ev, idx) => {
            const meta = getPortalTimelineMeta(ev.kind);
            const Icon = meta.icon;
            const tone = PORTAL_TIMELINE_TONE_CLASSES[meta.tone];
            const isLast = idx === q.data!.length - 1;
            return (
              <li key={`${ev.kind}-${ev.occurred_at}-${idx}`} className="flex gap-3">
                <div className="relative flex flex-col items-center">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone}`}
                    aria-hidden
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {!isLast && <span className="mt-1 w-px flex-1 bg-border" />}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="text-sm font-medium text-foreground">{meta.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatPortalEventDateTime(ev.occurred_at)}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
