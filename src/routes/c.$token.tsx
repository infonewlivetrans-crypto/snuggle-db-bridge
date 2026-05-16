import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Package, MapPin, Clock, ChevronRight, X } from "lucide-react";
import { STATUS_LABELS, STATUS_STYLES, type OrderStatus } from "@/lib/orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PortalOrderMessagesBlock } from "@/components/PortalOrderMessagesBlock";

type PortalOrder = {
  id: string;
  order_number: string;
  status: OrderStatus;
  created_at: string;
  delivery_address: string | null;
  delivery_window_from: string | null;
  delivery_window_to: string | null;
  delivery_time_comment: string | null;
  recipient_delivery_comment: string | null;
  recipient_access_comment: string | null;
};

type PortalPayload = {
  client: { id: string; name: string };
  orders: PortalOrder[];
};

export const Route = createFileRoute("/c/$token")({
  head: () => ({
    meta: [
      { title: "Кабинет клиента — Радиус Трек" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Кабинет клиента: ваши заказы и статусы доставки." },
    ],
  }),
  component: ClientPortalPage,
});

function ClientPortalPage() {
  const { token } = Route.useParams();
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["client-portal", token],
    queryFn: async (): Promise<PortalPayload> => {
      const res = await fetch(`/api/public/client-portal/${encodeURIComponent(token)}`, {
        headers: { accept: "application/json" },
      });
      if (res.status === 404 || res.status === 410) throw new Error("invalid");
      if (!res.ok) throw new Error("server");
      return (await res.json()) as PortalPayload;
    },
    retry: false,
  });

  const selected = useMemo(
    () => q.data?.orders.find((o) => o.id === openId) ?? null,
    [q.data, openId],
  );

  if (q.isLoading) {
    return <FullScreen>Загрузка…</FullScreen>;
  }
  if (q.isError || !q.data) {
    return <AccessClosed message="Ссылка недействительна или доступ закрыт" />;
  }

  const { client, orders } = q.data;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Кабинет клиента</h1>
          {client.name && (
            <p className="mt-1 text-sm text-muted-foreground">
              Здравствуйте, {client.name}. Здесь все ваши заказы.
            </p>
          )}
        </header>

        {orders.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Пока нет заказов. Новые заказы появятся здесь автоматически.
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => (
              <li
                key={o.id}
                className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/40"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(o.id)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-foreground">
                        Заказ {o.order_number}
                      </span>
                      <Badge variant="outline" className={STATUS_STYLES[o.status]}>
                        {STATUS_LABELS[o.status]}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      от {formatDate(o.created_at)}
                    </div>
                    {o.delivery_address && (
                      <div className="flex items-start gap-1.5 text-sm text-foreground">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{o.delivery_address}</span>
                      </div>
                    )}
                    {(o.delivery_window_from || o.delivery_window_to) && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        Окно доставки:{" "}
                        {timeShort(o.delivery_window_from)}–
                        {timeShort(o.delivery_window_to)}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <OrderDrawer order={selected} onClose={() => setOpenId(null)} />
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Эта ссылка персональная. Не передавайте её третьим лицам.
        </p>
      </div>
    </div>
  );
}

function OrderDrawer({ order, onClose }: { order: PortalOrder; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-xl border border-border bg-card p-5 shadow-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Заказ
            </div>
            <div className="text-lg font-semibold">{order.order_number}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 text-sm">
          <Row label="Статус">
            <Badge variant="outline" className={STATUS_STYLES[order.status]}>
              {STATUS_LABELS[order.status]}
            </Badge>
          </Row>
          <Row label="Дата">{formatDate(order.created_at)}</Row>
          {order.delivery_address && (
            <Row label="Адрес доставки">{order.delivery_address}</Row>
          )}
          {(order.delivery_window_from || order.delivery_window_to) && (
            <Row label="Окно доставки">
              {timeShort(order.delivery_window_from)}–{timeShort(order.delivery_window_to)}
            </Row>
          )}
          {order.delivery_time_comment && (
            <Row label="Комментарий по времени">{order.delivery_time_comment}</Row>
          )}
          {order.recipient_delivery_comment && (
            <Row label="Комментарий по доставке">{order.recipient_delivery_comment}</Row>
          )}
          {order.recipient_access_comment && (
            <Row label="Подъезд / разгрузка">{order.recipient_access_comment}</Row>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-foreground">{children}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function timeShort(v: string | null): string {
  if (!v) return "—";
  return v.slice(0, 5);
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      {children}
    </div>
  );
}

function AccessClosed({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-sm rounded-lg border border-border bg-card p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-300">
          <Lock className="h-6 w-6" />
        </div>
        <div className="text-base font-semibold">{message}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Обратитесь к менеджеру для получения новой ссылки.
        </div>
      </div>
    </div>
  );
}
