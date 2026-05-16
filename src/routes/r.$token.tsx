import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Package, Lock } from "lucide-react";

type PublicOrder = {
  order_number: string;
  status: string;
  delivery_address: string | null;
  delivery_window_from: string | null;
  delivery_window_to: string | null;
  delivery_time_comment: string | null;
  recipient_delivery_comment: string | null;
  recipient_access_comment: string | null;
  updated_at: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  new: "Принят",
  in_progress: "В работе",
  on_route: "В пути",
  delivered: "Доставлен",
  not_delivered: "Не доставлен",
  awaiting_return: "Возврат на склад",
  awaiting_resend: "Ожидает повторной отправки",
  return_accepted: "Возврат принят",
  completed: "Завершён",
  cancelled: "Отменён",
};

export const Route = createFileRoute("/r/$token")({
  head: () => ({
    meta: [
      { title: "Отслеживание заказа" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RecipientTrackPage,
});

function RecipientTrackPage() {
  const { token } = Route.useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["recipient-track", token],
    queryFn: async (): Promise<PublicOrder | null> => {
      const res = await fetch(`/api/public/order-track/${encodeURIComponent(token)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("lookup_failed");
      const body = (await res.json()) as { order: PublicOrder };
      return body.order;
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  if (isError || !data) {
    return <AccessClosed />;
  }

  const windowText =
    data.delivery_window_from || data.delivery_window_to
      ? `${data.delivery_window_from?.slice(0, 5) ?? "—"} – ${data.delivery_window_to?.slice(0, 5) ?? "—"}`
      : null;
  const statusLabel = STATUS_LABELS[data.status] ?? data.status;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Отслеживание заказа
            </div>
            <h1 className="text-xl font-semibold">№ {data.order_number}</h1>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <Field label="Статус" value={statusLabel} />
          {data.delivery_address && (
            <Field label="Адрес доставки" value={data.delivery_address} />
          )}
          {windowText && <Field label="Окно доставки" value={windowText} />}
          {data.delivery_time_comment && (
            <Field label="Время доставки" value={data.delivery_time_comment} />
          )}
          {data.recipient_delivery_comment && (
            <Field label="Комментарий по доставке" value={data.recipient_delivery_comment} />
          )}
          {data.recipient_access_comment && (
            <Field label="Подъезд / разгрузка" value={data.recipient_access_comment} />
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Ссылка действительна, пока её не аннулирует менеджер.
        </p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-sm">{value}</div>
    </div>
  );
}

function AccessClosed() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-sm rounded-lg border border-border bg-card p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-300">
          <Lock className="h-6 w-6" />
        </div>
        <div className="text-base font-semibold">Ссылка недействительна или доступ закрыт</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Обратитесь к менеджеру для получения новой ссылки.
        </div>
      </div>
    </div>
  );
}
