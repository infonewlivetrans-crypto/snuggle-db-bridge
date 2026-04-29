import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
      const { data } = await supabase
        .from("route_points")
        .select("route_id, routes:route_id(route_number, driver_name, driver_id, drivers:driver_id(full_name))")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const r = (data as unknown as {
        route_id: string | null;
        routes: { route_number: string | null; driver_name: string | null; drivers: { full_name: string | null } | null } | null;
      } | null);
      return {
        routeNumber: r?.routes?.route_number ?? null,
        driverName: r?.routes?.drivers?.full_name ?? r?.routes?.driver_name ?? null,
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
