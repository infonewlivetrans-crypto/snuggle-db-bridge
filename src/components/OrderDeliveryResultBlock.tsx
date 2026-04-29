import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, RotateCcw, Image as ImageIcon, Wallet, MessageSquare, QrCode } from "lucide-react";

type Props = { orderId: string; requiresQr: boolean; amountDue: number | null };

type PointRow = {
  id: string;
  dp_status: "delivered" | "not_delivered" | "returned_to_warehouse" | string;
  dp_amount_received: number | null;
  dp_payment_comment: string | null;
  dp_status_changed_at: string | null;
  dp_status_changed_by: string | null;
  route: { id: string; route_number: string | null; driver_name: string | null } | null;
};

const STATUS_LABEL: Record<string, string> = {
  delivered: "Доставлено",
  not_delivered: "Не доставлено",
  returned_to_warehouse: "Возврат на склад",
};

const STATUS_TONES: Record<string, string> = {
  delivered: "bg-emerald-100 text-emerald-900 border-emerald-200",
  not_delivered: "bg-red-100 text-red-900 border-red-200",
  returned_to_warehouse: "bg-orange-100 text-orange-900 border-orange-200",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  delivered: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  not_delivered: <XCircle className="h-4 w-4 text-red-600" />,
  returned_to_warehouse: <RotateCcw className="h-4 w-4 text-orange-600" />,
};

export function OrderDeliveryResultBlock({ orderId, requiresQr, amountDue }: Props) {
  const { data: point } = useQuery({
    queryKey: ["order-route-point-result", orderId],
    queryFn: async (): Promise<PointRow | null> => {
      const { data, error } = await supabase
        .from("route_points")
        .select(
          "id, dp_status, dp_amount_received, dp_payment_comment, dp_status_changed_at, dp_status_changed_by, route:route_id(id, route_number, driver_name)",
        )
        .eq("order_id", orderId)
        .in("dp_status", ["delivered", "not_delivered", "returned_to_warehouse"])
        .order("dp_status_changed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as PointRow) ?? null;
    },
  });

  const { data: photos } = useQuery({
    enabled: !!point?.id,
    queryKey: ["order-route-point-photos", point?.id],
    queryFn: async (): Promise<Array<{ kind: string; file_url: string }>> => {
      const { data, error } = await supabase
        .from("route_point_photos")
        .select("kind, file_url")
        .eq("route_point_id", point!.id);
      if (error) throw error;
      return (data ?? []) as Array<{ kind: string; file_url: string }>;
    },
  });

  if (!point) return null;
  const diff = (point.dp_amount_received ?? 0) - (amountDue ?? 0);
  const docs = (photos ?? []).filter((p) => p.kind === "document" || p.kind === "doc");
  const probs = (photos ?? []).filter((p) => p.kind === "problem");
  const qrs = (photos ?? []).filter((p) => p.kind === "qr");

  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {STATUS_ICON[point.dp_status]}
          <span className="text-sm font-semibold">Результат доставки</span>
          <Badge variant="outline" className={STATUS_TONES[point.dp_status]}>
            {STATUS_LABEL[point.dp_status] ?? point.dp_status}
          </Badge>
        </div>
        {point.route?.route_number && (
          <span className="text-xs text-muted-foreground">
            Маршрут {point.route.route_number}
            {point.route.driver_name ? ` · ${point.route.driver_name}` : ""}
          </span>
        )}
      </div>

      {amountDue != null && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1">
            <Wallet className="h-3 w-3" />К получению: {amountDue.toLocaleString("ru-RU")}
          </span>
          {point.dp_amount_received != null && (
            <span className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1">
              Получено: {point.dp_amount_received.toLocaleString("ru-RU")}
            </span>
          )}
          {point.dp_amount_received != null && diff !== 0 && (
            <span className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-red-700 dark:text-red-300">
              Расхождение: {(diff > 0 ? "+" : "") + diff.toLocaleString("ru-RU")}
            </span>
          )}
        </div>
      )}

      {requiresQr && (
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded border border-purple-500/30 bg-purple-500/10 px-2 py-1 text-xs text-purple-800 dark:text-purple-200">
            <QrCode className="h-3 w-3" />QR: {qrs.length > 0 ? `${qrs.length} фото` : "нет фото"}
          </span>
        </div>
      )}

      {(docs.length > 0 || probs.length > 0 || qrs.length > 0) && (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Фото</div>
          <div className="flex flex-wrap gap-1.5">
            {[...qrs, ...docs, ...probs].map((p, i) => (
              <a
                key={i}
                href={p.file_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-xs hover:bg-muted"
              >
                <ImageIcon className="h-3 w-3" />
                {p.kind === "qr" ? "QR" : p.kind === "problem" ? "проблема" : "документ"}
              </a>
            ))}
          </div>
        </div>
      )}

      {point.dp_payment_comment && (
        <div className="flex items-start gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-xs italic text-muted-foreground">
          <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
          {point.dp_payment_comment}
        </div>
      )}
    </div>
  );
}
