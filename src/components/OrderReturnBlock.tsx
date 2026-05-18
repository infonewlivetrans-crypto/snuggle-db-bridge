import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGetAuth, apiPatch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PackageX, Warehouse, Truck, User, Clock, MessageSquare, CheckCircle2 } from "lucide-react";
import type { Order } from "@/lib/orders";

const REASON_LABELS: Record<string, string> = {
  client_absent: "клиента нет",
  client_no_answer: "клиент не отвечает",
  no_payment: "нет оплаты",
  no_qr: "нет QR-кода",
  client_refused: "отказ клиента",
  no_unloading: "нет возможности выгрузки",
  defective: "брак",
  other: "другое",
};

type ReturnPoint = {
  id: string;
  dp_undelivered_reason: string | null;
  dp_return_warehouse_id: string | null;
  dp_return_comment: string | null;
  dp_expected_return_at: string | null;
  dp_status_changed_at: string | null;
  route_id: string;
  driver_full_name: string | null;
  driver_name: string | null;
  vehicle: { plate_number: string | null; brand: string | null; model: string | null } | null;
  warehouse_name: string | null;
};

type Photo = { id: string; file_url: string; kind: string };

interface Props {
  order: Order;
}

export function OrderReturnBlock({ order }: Props) {
  const qc = useQueryClient();
  const isReturnFlow =
    order.status === "awaiting_return" ||
    order.status === "return_accepted" ||
    order.status === "awaiting_resend";

  const { data } = useQuery({
    queryKey: ["return-info", order.id],
    enabled: isReturnFlow,
    queryFn: async () => {
      return await apiGetAuth<{ point: ReturnPoint | null; photos: Photo[] }>(
        `/api/order-return-info?order_id=${encodeURIComponent(order.id)}`,
      );
    },
  });
  const point = data?.point ?? null;
  const photos = data?.photos ?? [];

  const accept = useMutation({
    mutationFn: async () => {
      await apiPatch(`/api/orders/${order.id}`, { status: "return_accepted" });
    },
    onSuccess: () => {
      toast.success("Возврат принят складом");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["return-info", order.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isReturnFlow) return null;

  const driver =
    point?.routes?.drivers?.full_name ?? point?.routes?.driver_name ?? "—";
  const vehicle = point?.routes?.vehicles
    ? [
        point.routes.vehicles.brand,
        point.routes.vehicles.model,
        point.routes.vehicles.plate_number,
      ]
        .filter(Boolean)
        .join(" ")
    : "—";
  const warehouseName = point?.warehouses?.name ?? "—";
  const reason = point?.dp_undelivered_reason
    ? REASON_LABELS[point.dp_undelivered_reason] ?? point.dp_undelivered_reason
    : "—";
  const expected = point?.dp_expected_return_at
    ? new Date(point.dp_expected_return_at).toLocaleString("ru-RU")
    : "—";

  return (
    <div className="rounded-lg border-2 border-purple-300 bg-purple-50/60 p-4 dark:bg-purple-950/20">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PackageX className="h-5 w-5 text-purple-700 dark:text-purple-300" />
          <span className="font-semibold text-foreground">Возврат на склад</span>
        </div>
        <Badge
          variant="outline"
          className={
            order.status === "return_accepted"
              ? "border-emerald-300 bg-emerald-100 text-emerald-900"
              : "border-purple-300 bg-purple-100 text-purple-900"
          }
        >
          {order.status === "return_accepted"
            ? "Возврат принят складом"
            : "Ожидает возврата на склад"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <Row icon={<MessageSquare className="h-3.5 w-3.5" />} label="Причина возврата" value={reason} />
        <Row icon={<Warehouse className="h-3.5 w-3.5" />} label="Склад возврата" value={warehouseName} />
        <Row icon={<User className="h-3.5 w-3.5" />} label="Водитель" value={driver} />
        <Row icon={<Truck className="h-3.5 w-3.5" />} label="Машина" value={vehicle} />
        <Row icon={<Clock className="h-3.5 w-3.5" />} label="Ожидаемое время" value={expected} />
        <Row
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          label="Комментарий"
          value={point?.dp_return_comment || "—"}
        />
      </div>

      {photos.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Фото проблемы
          </div>
          <div className="flex flex-wrap gap-2">
            {photos.map((p) => (
              <a key={p.id} href={p.file_url} target="_blank" rel="noreferrer">
                <img
                  src={p.file_url}
                  alt="Фото проблемы"
                  className="h-20 w-20 rounded border border-border object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {order.status !== "return_accepted" && (
        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => accept.mutate()}
            disabled={accept.isPending}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          >
            <CheckCircle2 className="h-4 w-4" />
            Принять возврат на склад
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background/60 p-2">
      <div className="mb-0.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
