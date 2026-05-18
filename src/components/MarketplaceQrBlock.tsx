import { useQuery } from "@tanstack/react-query";
import { fetchListViaApi } from "@/lib/api-client";
import { QrCode, CheckCircle2, AlertCircle, Calendar, User, Route as RouteIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  orderId: string;
  qrPhotoUrl: string | null;
  qrUploadedAt: string | null;
  qrUploadedBy: string | null;
  qrReceived: boolean;
  requiresQr: boolean;
}

export function MarketplaceQrBlock({
  orderId,
  qrPhotoUrl,
  qrUploadedAt,
  qrUploadedBy,
  qrReceived,
  requiresQr,
}: Props) {
  // Подтянем последний маршрут / водителя для контекста
  const { data: ctx } = useQuery({
    queryKey: ["order-qr-route", orderId],
    enabled: !!qrPhotoUrl,
    queryFn: async () => {
      type Row = {
        route_id: string | null;
        created_at: string | null;
        routes: {
          route_number: string | null;
          driver_name: string | null;
          drivers: { full_name: string | null } | null;
        } | null;
      };
      const { rows } = await fetchListViaApi<Row>("/api/route-points", {
        limit: 50,
        extra: {
          order_id_in: orderId,
          fields:
            "route_id, created_at, routes:route_id(route_number, driver_name, drivers:driver_id(full_name))",
        },
      });
      const latest = rows
        .slice()
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0] ?? null;
      return {
        routeNumber: latest?.routes?.route_number ?? null,
        driverName: latest?.routes?.drivers?.full_name ?? latest?.routes?.driver_name ?? null,
      };
    },
  });

  const status = qrPhotoUrl || qrReceived ? "received" : "pending";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <QrCode className="h-4 w-4 text-muted-foreground" />
          QR-код маркетплейса
        </div>
        {status === "received" ? (
          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Получен
          </Badge>
        ) : (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
            <AlertCircle className="mr-1 h-3 w-3" />
            {requiresQr ? "Не получен" : "Не требуется"}
          </Badge>
        )}
      </div>

      {qrPhotoUrl ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px,1fr]">
          <a
            href={qrPhotoUrl}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-md border border-border bg-muted"
          >
            <img src={qrPhotoUrl} alt="QR-код маркетплейса" className="h-[140px] w-full object-cover" />
          </a>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2 text-foreground">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              {qrUploadedAt ? new Date(qrUploadedAt).toLocaleString("ru-RU") : "—"}
            </div>
            <div className="flex items-center gap-2 text-foreground">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              Водитель: {ctx?.driverName ?? qrUploadedBy ?? "—"}
            </div>
            <div className="flex items-center gap-2 text-foreground">
              <RouteIcon className="h-3.5 w-3.5 text-muted-foreground" />
              Маршрут: {ctx?.routeNumber ?? "—"}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm italic text-muted-foreground">
          Фото QR-кода ещё не загружено
        </div>
      )}
    </div>
  );
}
