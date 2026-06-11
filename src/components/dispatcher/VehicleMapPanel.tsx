import { useMemo, useState } from "react";
import { MapPin, Truck, AlertTriangle, Map as MapIcon, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { yandexMapsUrl } from "@/lib/geo";
import type { FreeVehicleRow } from "@/lib/dispatcher/api";

/**
 * Карта свободных машин.
 *
 * Архитектура согласована с уже существующим в проекте подходом
 * (см. src/components/RouteMapBlock.tsx, src/lib/geo.ts):
 *  - ОСНОВНОЙ режим — статическая карта Yandex (static-maps.yandex.ru/1.x/),
 *    как уже используется в маршрутах/заказах. Не требует SDK и ключа в браузере,
 *    масштабируется, корректно работает на mobile/desktop.
 *  - КЛИК по карте/машине — открытие интерактивной Я.Карты в новой вкладке
 *    (через yandexMapsUrl()), как сделано во всех других местах проекта.
 *  - FALLBACK — iframe yandex.ru/map-widget/v1, используется только если
 *    статическая карта не загрузилась.
 *  - Если координат нет совсем — отображается информер и список без ошибок.
 *
 * Не добавляем тяжёлых зависимостей и не делаем критическую зависимость
 * от внешнего SDK — в случае недоступности один уровень деградирует в другой.
 */

type Status = "free" | "mine" | "busy" | "no_coords";

function statusOf(v: FreeVehicleRow, selfId: string | null | undefined): Status {
  void selfId;
  const inWork =
    v.dispatcher_work_status === "in_work" ||
    v.dispatcher_work_status === "offered" ||
    v.dispatcher_work_status === "accepted";
  if (!v.has_coordinates) return "no_coords";
  if (inWork && v.taken_by_self) return "mine";
  if (inWork) return "busy";
  return "free";
}

const STATUS_COLOR: Record<Status, string> = {
  free: "bg-emerald-500",
  mine: "bg-primary",
  busy: "bg-destructive",
  no_coords: "bg-muted-foreground",
};
const STATUS_LABEL: Record<Status, string> = {
  free: "Свободна",
  mine: "В работе у меня",
  busy: "В работе у другого",
  no_coords: "Без координат",
};

// Я.Карты static-маркер по статусу
const MARKER_BY_STATUS: Record<Status, string> = {
  free: "pm2gnm",
  mine: "pm2blm",
  busy: "pm2rdm",
  no_coords: "pm2grm",
};

function withCoordsOnly(rows: FreeVehicleRow[]) {
  return rows.filter(
    (r) => r.has_coordinates && typeof r.current_lat === "number" && typeof r.current_lng === "number",
  );
}

/** Bounding box для авто-центра/зума по точкам. */
function computeBbox(rows: FreeVehicleRow[]) {
  const pts = withCoordsOnly(rows);
  if (pts.length === 0) return null;
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const r of pts) {
    const lat = r.current_lat as number;
    const lng = r.current_lng as number;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  const cLat = (minLat + maxLat) / 2;
  const cLng = (minLng + maxLng) / 2;
  const spanLat = Math.max(maxLat - minLat, 0.01);
  const spanLng = Math.max(maxLng - minLng, 0.01);
  return { cLat, cLng, spanLat, spanLng, count: pts.length };
}

/** Грубая оценка зума по размаху координат (стандартный приём для static-карт). */
function zoomFromSpan(spanLat: number, spanLng: number): number {
  const span = Math.max(spanLat, spanLng);
  if (span > 30) return 3;
  if (span > 15) return 4;
  if (span > 7) return 5;
  if (span > 3) return 6;
  if (span > 1.5) return 7;
  if (span > 0.7) return 8;
  if (span > 0.3) return 9;
  if (span > 0.15) return 10;
  if (span > 0.07) return 11;
  return 12;
}

/** Основной режим: static-карта Я.Карт. */
function buildStaticMapUrl(
  rows: FreeVehicleRow[],
  selfId: string | null | undefined,
  size: { w: number; h: number },
): string | null {
  const bb = computeBbox(rows);
  if (!bb) return null;
  const z = bb.count === 1 ? 10 : zoomFromSpan(bb.spanLat, bb.spanLng);
  const pts = withCoordsOnly(rows)
    .slice(0, 100)
    .map((r) => {
      const st = statusOf(r, selfId);
      return `${(r.current_lng as number).toFixed(6)},${(r.current_lat as number).toFixed(6)},${MARKER_BY_STATUS[st]}`;
    })
    .join("~");
  const w = Math.min(Math.max(size.w, 300), 650);
  const h = Math.min(Math.max(size.h, 200), 450);
  return `https://static-maps.yandex.ru/1.x/?l=map&ll=${bb.cLng.toFixed(6)},${bb.cLat.toFixed(6)}&z=${z}&size=${w},${h}&pt=${pts}`;
}

/** Fallback: iframe-виджет Я.Карт (используется только если static не загрузился). */
function buildIframeFallbackUrl(rows: FreeVehicleRow[], selfId: string | null | undefined): string | null {
  const bb = computeBbox(rows);
  if (!bb) return null;
  const pts = withCoordsOnly(rows)
    .slice(0, 100)
    .map((r) => {
      const st = statusOf(r, selfId);
      return `${(r.current_lng as number).toFixed(6)},${(r.current_lat as number).toFixed(6)},${MARKER_BY_STATUS[st]}`;
    })
    .join("~");
  const url = new URL("https://yandex.ru/map-widget/v1/");
  url.searchParams.set("ll", `${bb.cLng.toFixed(6)},${bb.cLat.toFixed(6)}`);
  url.searchParams.set("z", String(bb.count === 1 ? 10 : zoomFromSpan(bb.spanLat, bb.spanLng)));
  url.searchParams.set("l", "map");
  url.searchParams.set("pt", pts);
  return url.toString();
}

export interface VehicleMapPanelProps {
  rows: FreeVehicleRow[];
  selfId?: string | null;
  onOpen: (id: string) => void;
  onTake?: (id: string) => void;
  taking?: boolean;
}

export function VehicleMapPanel({ rows, selfId, onOpen, onTake, taking }: VehicleMapPanelProps) {
  const [staticFailed, setStaticFailed] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
  const withCoords = useMemo(() => withCoordsOnly(rows), [rows]);
  const withoutCoords = useMemo(() => rows.filter((r) => !r.has_coordinates), [rows]);

  const staticUrl = useMemo(
    () => buildStaticMapUrl(rows, selfId, { w: 650, h: 420 }),
    [rows, selfId],
  );
  const iframeUrl = useMemo(() => buildIframeFallbackUrl(rows, selfId), [rows, selfId]);

  // Ссылка на интерактивную Я.Карту (как в RouteMapBlock — клик откроет реальные Я.Карты).
  const openInYandex = useMemo(() => {
    const bb = computeBbox(rows);
    if (!bb) return null;
    return yandexMapsUrl(bb.cLat, bb.cLng, bb.count === 1 ? 10 : zoomFromSpan(bb.spanLat, bb.spanLng));
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* desktop: карта слева, список справа; mobile: карта сверху, список снизу */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/40 px-3 py-2 text-xs">
            <div className="flex items-center gap-2 font-semibold">
              <MapIcon className="h-4 w-4 text-primary" />
              Карта свободных машин
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <Legend color="bg-emerald-500" label="Свободна" />
              <Legend color="bg-primary" label="У меня" />
              <Legend color="bg-destructive" label="У другого" />
              <span className="text-muted-foreground/80">
                На карте: {withCoords.length} из {rows.length}
              </span>
              {openInYandex && (
                <a
                  href={openInYandex}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Я.Карты
                </a>
              )}
            </div>
          </div>

          <div className="relative h-[55vh] min-h-[320px] w-full bg-muted/30 sm:h-[60vh]">
            {staticUrl && !staticFailed ? (
              // ОСНОВНОЙ: статическая Я.Карта (как в RouteMapBlock)
              <a
                href={openInYandex ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="absolute inset-0 block"
                title="Открыть на Я.Картах"
              >
                <img
                  src={staticUrl}
                  alt="Карта свободных машин"
                  loading="lazy"
                  onError={() => setStaticFailed(true)}
                  className="h-full w-full object-cover"
                />
              </a>
            ) : iframeUrl && !iframeFailed ? (
              // FALLBACK: iframe-виджет (только если static не загрузился)
              <iframe
                title="Карта свободных машин (fallback)"
                src={iframeUrl}
                className="absolute inset-0 h-full w-full border-0"
                loading="lazy"
                onError={() => setIframeFailed(true)}
                allow="geolocation"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                <div className="text-sm font-medium">
                  {staticUrl ? "Карта недоступна" : "Нет координат для отображения на карте"}
                </div>
                <div className="max-w-md text-xs text-muted-foreground">
                  Машины без координат доступны в списке. Укажите текущий город и
                  координаты в карточке транспорта.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Список рядом (desktop) / снизу (mobile) */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-3 py-2 text-xs font-semibold">
            На карте · {withCoords.length}
          </div>
          {withCoords.length > 0 ? (
            <div className="max-h-[60vh] space-y-2 overflow-auto p-2">
              {withCoords.map((v) => (
                <MiniVehicleCard
                  key={v.id}
                  v={v}
                  selfId={selfId}
                  onOpen={() => onOpen(v.id)}
                  onTake={onTake ? () => onTake(v.id) : undefined}
                  taking={!!taking}
                />
              ))}
            </div>
          ) : (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Нет машин с координатами
            </div>
          )}
        </div>
      </div>

      {/* Без координат — отдельный блок (fallback списком) */}
      {withoutCoords.length > 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-semibold">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            Машины без координат
            <Badge variant="secondary">{withoutCoords.length}</Badge>
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {withoutCoords.map((v) => (
              <MiniVehicleCard
                key={v.id}
                v={v}
                selfId={selfId}
                onOpen={() => onOpen(v.id)}
                onTake={onTake ? () => onTake(v.id) : undefined}
                taking={!!taking}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function MiniVehicleCard({
  v,
  selfId,
  onOpen,
  onTake,
  taking,
}: {
  v: FreeVehicleRow;
  selfId: string | null | undefined;
  onOpen: () => void;
  onTake?: () => void;
  taking: boolean;
}) {
  const st = statusOf(v, selfId);
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-card p-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1 truncate font-semibold text-foreground">
            <Truck className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {v.vehicle_kind ?? "—"}
              {v.body_type ? ` · ${v.body_type}` : ""}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 truncate text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {v.current_city ?? v.home_city ?? "—"}
              {v.ready_to_cities?.length ? ` → ${v.ready_to_cities.join(", ")}` : ""}
            </span>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white ${STATUS_COLOR[st]}`}
          title={STATUS_LABEL[st]}
        >
          {STATUS_LABEL[st]}
        </span>
      </div>
      <div className="truncate text-muted-foreground">
        {v.carrier?.name ?? "—"} · {v.driver?.full_name ?? "—"}
      </div>
      <div className="mt-1 flex gap-1">
        <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={onOpen}>
          Открыть
        </Button>
        {st === "free" && onTake ? (
          <Button size="sm" className="h-7 flex-1 text-xs" disabled={taking} onClick={onTake}>
            Взять
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------- Route preview (для предложения перевозчику) -------------------- */

export interface RoutePreviewPoint {
  lat?: number | null;
  lng?: number | null;
  city?: string | null;
  address?: string | null;
  label?: string | null;
}

/**
 * Превью маршрута для предложения перевозчику.
 * Используется тот же подход, что и в RouteMapBlock — static-карта Я.Карт
 * с двумя метками (погрузка/выгрузка). Клик — переход в интерактивные Я.Карты.
 * Если static не загрузился — деградация к iframe-виджету; если и он не доступен —
 * текстовый fallback "город → город".
 */
export function RouteMapPreview({
  loading,
  unloading,
  height = "h-48",
}: {
  loading: RoutePreviewPoint;
  unloading: RoutePreviewPoint;
  height?: string;
}) {
  const [staticFailed, setStaticFailed] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);

  const a = loading, b = unloading;
  const hasA = typeof a.lat === "number" && typeof a.lng === "number";
  const hasB = typeof b.lat === "number" && typeof b.lng === "number";

  if (!hasA && !hasB) {
    return (
      <div
        className={`${height} flex items-center justify-center rounded-md border border-dashed bg-muted/30 px-3 text-center text-xs text-muted-foreground`}
      >
        <div>
          <div className="font-medium text-foreground">
            {(a.city ?? "—") + " → " + (b.city ?? "—")}
          </div>
          <div>Координаты не указаны — маршрут показан списком.</div>
        </div>
      </div>
    );
  }

  const both = hasA && hasB;
  const pts: string[] = [];
  if (hasA) pts.push(`${(a.lng as number).toFixed(6)},${(a.lat as number).toFixed(6)},pm2gnm1`);
  if (hasB) pts.push(`${(b.lng as number).toFixed(6)},${(b.lat as number).toFixed(6)},pm2rdm2`);

  const cLng = both ? ((a.lng as number) + (b.lng as number)) / 2 : (hasA ? (a.lng as number) : (b.lng as number));
  const cLat = both ? ((a.lat as number) + (b.lat as number)) / 2 : (hasA ? (a.lat as number) : (b.lat as number));
  const spanLat = both ? Math.abs((a.lat as number) - (b.lat as number)) : 0.5;
  const spanLng = both ? Math.abs((a.lng as number) - (b.lng as number)) : 0.5;
  const z = both ? zoomFromSpan(spanLat, spanLng) : 9;

  const staticUrl = `https://static-maps.yandex.ru/1.x/?l=map&ll=${cLng.toFixed(6)},${cLat.toFixed(6)}&z=${z}&size=600,300&pt=${pts.join("~")}`;
  const openHref = yandexMapsUrl(cLat, cLng, z);

  const iframeUrl = (() => {
    const u = new URL("https://yandex.ru/map-widget/v1/");
    u.searchParams.set("ll", `${cLng.toFixed(6)},${cLat.toFixed(6)}`);
    u.searchParams.set("z", String(z));
    u.searchParams.set("l", "map");
    u.searchParams.set("pt", pts.join("~"));
    return u.toString();
  })();

  return (
    <div className={`${height} overflow-hidden rounded-md border border-border`}>
      {!staticFailed ? (
        <a href={openHref} target="_blank" rel="noreferrer" className="block h-full w-full">
          <img
            src={staticUrl}
            alt="Маршрут предложения"
            loading="lazy"
            onError={() => setStaticFailed(true)}
            className="h-full w-full object-cover"
          />
        </a>
      ) : !iframeFailed ? (
        <iframe
          title="Маршрут предложения (fallback)"
          src={iframeUrl}
          className="h-full w-full border-0"
          loading="lazy"
          onError={() => setIframeFailed(true)}
        />
      ) : (
        <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
          {(a.city ?? "—") + " → " + (b.city ?? "—")}
        </div>
      )}
    </div>
  );
}
