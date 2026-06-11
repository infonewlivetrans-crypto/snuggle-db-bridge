import { useMemo, useState } from "react";
import { MapPin, Truck, AlertTriangle, Map as MapIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FreeVehicleRow } from "@/lib/dispatcher/api";

/**
 * Адаптивная карта свободных машин на базе встраиваемого виджета Я.Карт
 * (https://yandex.ru/map-widget/v1/). Не требует API-ключа в браузере,
 * корректно работает в РФ. Поддерживает drag/zoom/pinch нативно.
 *
 * Если у машин нет координат — карта показывается по умолчанию (центр РФ),
 * а машины без координат отображаются ниже отдельным блоком-fallback.
 *
 * При недоступности iframe (например, заблокирован сетью) показывается
 * static-fallback с городами и списком — интерфейс не ломается.
 */

type Status = "free" | "mine" | "busy" | "no_coords";

function statusOf(v: FreeVehicleRow, selfId: string | null | undefined): Status {
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

// Я.Карты static маркер по статусу
const MARKER_BY_STATUS: Record<Status, string> = {
  free: "pm2gnm",
  mine: "pm2blm",
  busy: "pm2rdm",
  no_coords: "pm2grm",
};

function buildYandexEmbedUrl(rows: FreeVehicleRow[], selfId: string | null | undefined): string | null {
  const withCoords = rows.filter((r) => r.has_coordinates);
  if (withCoords.length === 0) return null;
  const ptParts = withCoords.slice(0, 100).map((r) => {
    const st = statusOf(r, selfId);
    return `${(r.current_lng as number).toFixed(6)},${(r.current_lat as number).toFixed(6)},${MARKER_BY_STATUS[st]}`;
  });
  // Центр — первая точка
  const first = withCoords[0]!;
  const ll = `${(first.current_lng as number).toFixed(6)},${(first.current_lat as number).toFixed(6)}`;
  const url = new URL("https://yandex.ru/map-widget/v1/");
  url.searchParams.set("ll", ll);
  url.searchParams.set("z", withCoords.length === 1 ? "9" : "5");
  url.searchParams.set("l", "map");
  url.searchParams.set("pt", ptParts.join("~"));
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
  const [iframeFailed, setIframeFailed] = useState(false);
  const withCoords = useMemo(() => rows.filter((r) => r.has_coordinates), [rows]);
  const withoutCoords = useMemo(() => rows.filter((r) => !r.has_coordinates), [rows]);
  const embedUrl = useMemo(() => buildYandexEmbedUrl(rows, selfId), [rows, selfId]);

  return (
    <div className="space-y-4">
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
          </div>
        </div>

        <div className="relative h-[60vh] min-h-[360px] w-full bg-muted/30 sm:h-[70vh]">
          {embedUrl && !iframeFailed ? (
            <iframe
              title="Карта свободных машин"
              src={embedUrl}
              className="absolute inset-0 h-full w-full border-0"
              loading="lazy"
              onError={() => setIframeFailed(true)}
              allow="geolocation"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
              <div className="text-sm font-medium">
                {embedUrl ? "Карта недоступна" : "Нет координат для отображения на карте"}
              </div>
              <div className="text-xs text-muted-foreground max-w-md">
                Машины без координат доступны в списке ниже. Укажите текущий город и координаты в карточке транспорта.
              </div>
            </div>
          )}
        </div>

        {/* Список машин на карте — компактные карточки рядом с картой */}
        {withCoords.length > 0 ? (
          <div className="grid gap-2 border-t border-border bg-card/50 p-3 sm:grid-cols-2 lg:grid-cols-3">
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
        ) : null}
      </div>

      {/* Без координат */}
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
            <span className="truncate">{v.vehicle_kind ?? "—"}{v.body_type ? ` · ${v.body_type}` : ""}</span>
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

export function RouteMapPreview({
  loading,
  unloading,
  height = "h-48",
}: {
  loading: RoutePreviewPoint;
  unloading: RoutePreviewPoint;
  height?: string;
}) {
  const a = loading, b = unloading;
  const hasA = typeof a.lat === "number" && typeof a.lng === "number";
  const hasB = typeof b.lat === "number" && typeof b.lng === "number";
  const both = hasA && hasB;

  if (!hasA && !hasB) {
    return (
      <div className={`${height} flex items-center justify-center rounded-md border border-dashed bg-muted/30 px-3 text-center text-xs text-muted-foreground`}>
        <div>
          <div className="font-medium text-foreground">
            {(a.city ?? "—") + " → " + (b.city ?? "—")}
          </div>
          <div>Координаты не указаны — маршрут показан списком.</div>
        </div>
      </div>
    );
  }

  const pt: string[] = [];
  if (hasA) pt.push(`${(a.lng as number).toFixed(6)},${(a.lat as number).toFixed(6)},pm2gnm1`);
  if (hasB) pt.push(`${(b.lng as number).toFixed(6)},${(b.lat as number).toFixed(6)},pm2rdm2`);

  const url = new URL("https://yandex.ru/map-widget/v1/");
  if (both) {
    const cLng = ((a.lng as number) + (b.lng as number)) / 2;
    const cLat = ((a.lat as number) + (b.lat as number)) / 2;
    url.searchParams.set("ll", `${cLng.toFixed(6)},${cLat.toFixed(6)}`);
    url.searchParams.set("z", "5");
  } else {
    const p = hasA ? a : b;
    url.searchParams.set("ll", `${(p.lng as number).toFixed(6)},${(p.lat as number).toFixed(6)}`);
    url.searchParams.set("z", "8");
  }
  url.searchParams.set("l", "map");
  url.searchParams.set("pt", pt.join("~"));

  return (
    <div className={`${height} overflow-hidden rounded-md border border-border`}>
      <iframe
        title="Маршрут предложения"
        src={url.toString()}
        className="h-full w-full border-0"
        loading="lazy"
      />
    </div>
  );
}
