import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Map, Navigation, AlertTriangle, MapPin } from "lucide-react";
import {
  POINT_STATUS_LABELS,
  POINT_STATUS_STYLES,
  type PointStatus,
} from "@/lib/routes";
import { yandexMapsUrl, yandexNavigatorUrl, formatCoords } from "@/lib/geo";

type MapPoint = {
  id: string;
  point_number: number;
  status: PointStatus;
  order: {
    order_number: string;
    contact_name: string | null;
    delivery_address: string | null;
    latitude: number | null;
    longitude: number | null;
  };
};

/** Сборка статической карты Yandex с несколькими метками. */
function multiPointStaticMap(
  pts: { lat: number; lng: number; n: number }[],
  opts: { width?: number; height?: number } = {},
): string | null {
  if (pts.length === 0) return null;
  const { width = 900, height = 360 } = opts;
  // pm2rdm{n} — красная метка с номером (1-99)
  const markers = pts
    .map((p) => `${p.lng},${p.lat},pm2rdm${Math.min(p.n, 99)}`)
    .join("~");
  const sizeW = Math.min(Math.max(width, 300), 650);
  const sizeH = Math.min(Math.max(height, 200), 450);
  return `https://static-maps.yandex.ru/1.x/?l=map&size=${sizeW},${sizeH}&pt=${markers}`;
}

export function RouteMapBlock({ points }: { points: MapPoint[] }) {
  const withCoords = points.filter(
    (p) =>
      typeof p.order.latitude === "number" &&
      typeof p.order.longitude === "number",
  );
  const withoutCoords = points.filter(
    (p) =>
      typeof p.order.latitude !== "number" ||
      typeof p.order.longitude !== "number",
  );

  const mapUrl = multiPointStaticMap(
    withCoords.map((p) => ({
      lat: p.order.latitude as number,
      lng: p.order.longitude as number,
      n: p.point_number,
    })),
  );

  // Ссылка "посмотреть на я.картах": центрируем по первой точке
  const firstWithCoords = withCoords[0];
  const openAllUrl = firstWithCoords
    ? yandexMapsUrl(
        firstWithCoords.order.latitude as number,
        firstWithCoords.order.longitude as number,
        12,
      )
    : null;

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Map className="h-4 w-4 text-primary" />
          Карта маршрута
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>На карте: {withCoords.length} из {points.length}</span>
          {openAllUrl && (
            <a
              href={openAllUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <MapPin className="h-3 w-3" />
              Открыть на Я.Картах
            </a>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {mapUrl ? (
          <a
            href={openAllUrl ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-lg border border-border"
          >
            <img
              src={mapUrl}
              alt="Карта маршрута"
              loading="lazy"
              className="h-72 w-full object-cover"
            />
          </a>
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Нет точек с координатами для отображения на карте
          </div>
        )}

        {withoutCoords.length > 0 && (
          <div className="rt-alert rt-alert-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold">
                Нет координат: {withoutCoords.length} точек
              </div>
              <div className="opacity-80">
                Эти точки не отображаются на карте. Маршрут может быть неточным.
              </div>
            </div>
          </div>
        )}

        {points.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {points.map((p) => {
              const has =
                typeof p.order.latitude === "number" &&
                typeof p.order.longitude === "number";
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {p.point_number}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {p.order.order_number}
                      </span>
                      {p.order.contact_name && (
                        <span className="text-foreground">{p.order.contact_name}</span>
                      )}
                      <Badge
                        variant="outline"
                        className={POINT_STATUS_STYLES[p.status]}
                      >
                        {POINT_STATUS_LABELS[p.status]}
                      </Badge>
                      {has ? (
                        <Badge
                          variant="outline"
                          className="border-green-200 bg-green-100 text-green-900"
                        >
                          Есть координаты
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-200 bg-amber-100 text-amber-900"
                        >
                          Нет координат
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.order.delivery_address || (
                        <span className="italic">Адрес не указан</span>
                      )}
                      {has && (
                        <span className="ml-2 font-mono">
                          {formatCoords(
                            p.order.latitude as number,
                            p.order.longitude as number,
                            5,
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  {has && (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                    >
                      <a
                        href={yandexNavigatorUrl(
                          p.order.latitude as number,
                          p.order.longitude as number,
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        В навигатор
                      </a>
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
