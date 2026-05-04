import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MapPin,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Clock,
  CalendarDays,
  Phone,
} from "lucide-react";
import { POINT_STATUS_LABELS, POINT_STATUS_STYLES, type PointStatus } from "@/lib/routes";
import { formatRuPhone } from "@/lib/phone";

type Point = {
  id: string;
  point_number: number;
  status: PointStatus;
  client_window_from: string | null;
  client_window_to: string | null;
  order: {
    id: string;
    order_number: string;
    delivery_address: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    latitude: number | null;
    longitude: number | null;
    map_link: string | null;
    client_works_weekends: boolean;
  } | null;
};

function formatTime(t: string | null) {
  if (!t) return null;
  return t.slice(0, 5);
}

function mapHref(p: Point["order"]) {
  if (!p) return null;
  if (p.map_link) return p.map_link;
  if (p.latitude != null && p.longitude != null) {
    return `https://yandex.ru/maps/?pt=${p.longitude},${p.latitude}&z=16&l=map`;
  }
  if (p.delivery_address) {
    return `https://yandex.ru/maps/?text=${encodeURIComponent(p.delivery_address)}`;
  }
  return null;
}

export function DeliveryPointsBlock({ requestId }: { requestId: string }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["request-delivery-points", requestId],
    queryFn: async (): Promise<Point[]> => {
      const { data, error } = await supabase
        .from("route_points")
        .select(
          "id, point_number, status, client_window_from, client_window_to, order:order_id(id, order_number, delivery_address, contact_name, contact_phone, latitude, longitude, map_link, client_works_weekends)",
        )
        .eq("route_id", requestId)
        .order("point_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Point[];
    },
  });

  const reorder = useMutation({
    mutationFn: async (newOrder: Point[]) => {
      // Two-phase update to avoid unique constraint clashes if any
      const tempBase = 100000;
      for (let i = 0; i < newOrder.length; i++) {
        const { error } = await supabase
          .from("route_points")
          .update({ point_number: tempBase + i })
          .eq("id", newOrder[i].id);
        if (error) throw error;
      }
      for (let i = 0; i < newOrder.length; i++) {
        const { error } = await supabase
          .from("route_points")
          .update({ point_number: i + 1 })
          .eq("id", newOrder[i].id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Порядок точек обновлён");
      qc.invalidateQueries({ queryKey: ["request-delivery-points", requestId] });
      qc.invalidateQueries({ queryKey: ["request-orders", requestId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Не удалось сохранить порядок"),
  });

  const move = (idx: number, dir: -1 | 1) => {
    if (!data) return;
    const next = [...data];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    reorder.mutate(next);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          Точки доставки
        </div>
        <span className="text-xs text-muted-foreground">
          Всего: {data?.length ?? 0}
        </span>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Загрузка...</div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Добавьте заказы в заявку — точки доставки появятся здесь автоматически
        </div>
      ) : (
        <ol className="space-y-2">
          {data.map((p, idx) => {
            const o = p.order;
            const href = mapHref(o);
            const wf = formatTime(p.client_window_from);
            const wt = formatTime(p.client_window_to);
            return (
              <li
                key={p.id}
                className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-start"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {p.point_number}
                </div>

                <div className="flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {o?.order_number ?? "—"}
                    </span>
                    {o?.contact_name && (
                      <span className="text-sm text-foreground">{o.contact_name}</span>
                    )}
                    <Badge
                      variant="outline"
                      className={POINT_STATUS_STYLES[p.status] ?? ""}
                    >
                      {POINT_STATUS_LABELS[p.status] ?? p.status}
                    </Badge>
                    {o?.client_works_weekends && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/50 px-1.5 py-0.5 text-xs text-foreground">
                        <CalendarDays className="h-3 w-3" />
                        Работает в выходные
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {o?.delivery_address || (
                      <span className="italic">Адрес не указан</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {wf || wt ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Окно: {wf ?? "…"}–{wt ?? "…"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Окно не задано
                      </span>
                    )}
                    {o?.contact_phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {o.contact_phone}
                      </span>
                    )}
                    {o?.latitude != null && o?.longitude != null && (
                      <span className="font-mono">
                        {Number(o.latitude).toFixed(5)}, {Number(o.longitude).toFixed(5)}
                      </span>
                    )}
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Открыть на карте
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 gap-1 sm:flex-col">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={idx === 0 || reorder.isPending}
                    onClick={() => move(idx, -1)}
                    title="Переместить вверх"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={idx === data.length - 1 || reorder.isPending}
                    onClick={() => move(idx, 1)}
                    title="Переместить вниз"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
