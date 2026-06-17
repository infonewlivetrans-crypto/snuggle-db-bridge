import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Truck, AlertTriangle, Map as MapIcon, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { yandexMapsUrl } from "@/lib/geo";
import { normalizeVehicleBodyType, getVehicleBodyTypeLabel } from "@/lib/dispatcher/vehicle-options";
import type { FreeVehicleRow } from "@/lib/dispatcher/api";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

/* ============================================================
 *  Карта свободных машин на Leaflet + OpenStreetMap.
 *  - интерактивная (drag, wheel-zoom, dbl-click zoom);
 *  - кастомные SVG-иконки грузовиков по типу кузова;
 *  - цвет иконки по статусу (free / mine / busy / no_coords);
 *  - кластеризация маркеров;
 *  - попап с мини-карточкой машины;
 *  - правый список — карточки, а не плоские строки.
 *  Leaflet монтируется только в браузере (window-guard).
 * ============================================================ */

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
  free: "#10b981", // emerald
  mine: "#3b82f6", // blue
  busy: "#ef4444", // red
  no_coords: "#9ca3af", // gray
};
const STATUS_LABEL: Record<Status, string> = {
  free: "Свободна",
  mine: "В работе у меня",
  busy: "В работе у другого",
  no_coords: "Без координат",
};
const STATUS_BADGE_CLASS: Record<Status, string> = {
  free: "bg-emerald-500",
  mine: "bg-primary",
  busy: "bg-destructive",
  no_coords: "bg-muted-foreground",
};

/** Эмодзи-знак типа кузова для отрисовки внутри иконки. */
function bodyEmoji(bodyType: string | null | undefined): string {
  const code = normalizeVehicleBodyType(bodyType) ?? "";
  switch (code) {
    case "tent": return "🚛";
    case "ref": return "❄️";
    case "isothermal": return "🌡️";
    case "van":
    case "box": return "📦";
    case "flatbed":
    case "open_platform": return "🛻";
    case "container": return "🚢";
    case "dump": return "⛏️";
    case "cistern": return "🛢️";
    case "car_transporter": return "🚗";
    case "low_loader": return "🚜";
    case "grain_truck": return "🌾";
    case "livestock": return "🐄";
    case "tow_truck": return "🚧";
    case "manipulator": return "🏗️";
    default: return "🚚";
  }
}

function fmtNum(n: number | null | undefined, suffix = ""): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n}${suffix}`;
}
function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
}

function withCoordsOnly(rows: FreeVehicleRow[]) {
  return rows.filter(
    (r) => r.has_coordinates && typeof r.current_lat === "number" && typeof r.current_lng === "number",
  );
}

export interface VehicleMapPanelProps {
  rows: FreeVehicleRow[];
  selfId?: string | null;
  onOpen: (id: string) => void;
  onTake?: (id: string) => void;
  taking?: boolean;
}

export function VehicleMapPanel({ rows, selfId, onOpen, onTake, taking }: VehicleMapPanelProps) {
  const withCoords = useMemo(() => withCoordsOnly(rows), [rows]);
  const withoutCoords = useMemo(() => rows.filter((r) => !r.has_coordinates), [rows]);

  // Ссылка "открыть в Я.Картах" для удобства диспетчера
  const openInYandex = useMemo(() => {
    if (withCoords.length === 0) return null;
    let sLat = 0, sLng = 0;
    for (const r of withCoords) {
      sLat += r.current_lat as number;
      sLng += r.current_lng as number;
    }
    return yandexMapsUrl(sLat / withCoords.length, sLng / withCoords.length, 6);
  }, [withCoords]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
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

          <LeafletVehicleMap
            rows={withCoords}
            selfId={selfId}
            onOpen={onOpen}
            onTake={onTake}
            taking={!!taking}
          />
        </div>

        {/* Список карточек справа (desktop) / снизу (mobile) */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-3 py-2 text-xs font-semibold">
            На карте · {withCoords.length}
          </div>
          {withCoords.length > 0 ? (
            <div className="max-h-[60vh] space-y-2 overflow-auto p-2">
              {withCoords.map((v) => (
                <VehicleMiniCard
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

      {withoutCoords.length > 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-semibold">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            Машины без координат
            <Badge variant="secondary">{withoutCoords.length}</Badge>
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {withoutCoords.map((v) => (
              <VehicleMiniCard
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

/* -------------------- Карточка машины (список + попап) -------------------- */

function VehicleMiniCard({
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
  const body = getVehicleBodyTypeLabel(v.body_type) || v.body_type || "—";
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-2.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <span className="text-base leading-none">{bodyEmoji(v.body_type)}</span>
          <span className="truncate">{body}</span>
        </div>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white ${STATUS_BADGE_CLASS[st]}`}
          title={STATUS_LABEL[st]}
        >
          {STATUS_LABEL[st]}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-muted-foreground">
        <div><span className="text-foreground/70">Тоннаж:</span> {v.payload_kg != null ? `${(v.payload_kg / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} т` : "—"}</div>
        <div><span className="text-foreground/70">Объём:</span> {fmtNum(v.volume_m3, " м³")}</div>
      </div>
      <div className="flex items-center gap-1 truncate text-muted-foreground">
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {v.current_city ?? v.home_city ?? "—"}
          {v.ready_to_cities?.length ? ` → ${v.ready_to_cities.slice(0, 3).join(", ")}` : ""}
        </span>
      </div>
      <div className="truncate text-muted-foreground">
        <Truck className="mr-1 inline h-3 w-3" />
        {v.carrier?.name ?? "—"} · {v.driver?.full_name ?? "—"}
      </div>
      {(v.driver?.phone || v.carrier?.phone) ? (
        <div className="truncate text-muted-foreground">
          <span className="text-foreground/70">Тел:</span>{" "}
          {v.driver?.phone || v.carrier?.phone}
        </div>
      ) : null}
      {(v.minimum_km_rate || v.minimum_trip_rate) ? (
        <div className="text-muted-foreground">
          {v.minimum_km_rate ? <>За км: <span className="text-foreground">{fmtMoney(v.minimum_km_rate)}</span></> : null}
          {v.minimum_km_rate && v.minimum_trip_rate ? " · " : null}
          {v.minimum_trip_rate ? <>За рейс: <span className="text-foreground">{fmtMoney(v.minimum_trip_rate)}</span></> : null}
        </div>
      ) : null}
      {v.ready_comment ? (
        <div className="line-clamp-2 text-muted-foreground">
          <span className="text-foreground/70">Готовность:</span> {v.ready_comment}
        </div>
      ) : null}
      <div className="mt-0.5 flex gap-1">
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

/* -------------------- Leaflet map -------------------- */

function LeafletVehicleMap({
  rows,
  selfId,
  onOpen,
  onTake,
  taking,
}: {
  rows: FreeVehicleRow[];
  selfId: string | null | undefined;
  onOpen: (id: string) => void;
  onTake?: (id: string) => void;
  taking: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Хранимся в any, чтобы не тянуть типы leaflet в SSR-граф.
  const mapRef = useRef<any>(null);
  const clusterRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Инициализация карты — один раз на маунте (только в браузере).
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        await import("leaflet.markercluster");
        if (cancelled || !containerRef.current) return;

        const map = L.map(containerRef.current, {
          center: [61.5, 90.0], // центр РФ (примерно — между Уралом и Сибирью)
          zoom: 3,
          minZoom: 3,
          maxZoom: 18,
          scrollWheelZoom: true,
          doubleClickZoom: true,
          dragging: true,
          worldCopyJump: false,
        });

        // Основной слой — стандартный OpenStreetMap: подписи рендерятся
        // на родном языке региона, т.е. в РФ — кириллицей по-русски.
        // Атрибуция переведена на русский, чтобы карта не выглядела
        // иностранной. Fallback на CartoDB при недоступности OSM.
        const primary = L.tileLayer(
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 18,
            attribution:
              '&copy; участники <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
            crossOrigin: true,
          },
        );
        let fallbackAdded = false;
        primary.on("tileerror", () => {
          if (fallbackAdded) return;
          fallbackAdded = true;
          try {
            L.tileLayer(
              "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
              {
                maxZoom: 19,
                subdomains: "abcd",
                attribution:
                  '&copy; участники OpenStreetMap, тайлы CARTO',
              },
            ).addTo(map);
          } catch {
            /* noop */
          }
        });
        primary.addTo(map);

        const cluster = (L as any).markerClusterGroup({
          showCoverageOnHover: false,
          maxClusterRadius: 50,
          spiderfyOnMaxZoom: true,
          chunkedLoading: true,
        });
        map.addLayer(cluster);

        mapRef.current = map;
        clusterRef.current = cluster;
        setReady(true);
      } catch (e) {
        console.error("[VehicleMap] leaflet init failed", e);
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      try {
        clusterRef.current?.clearLayers();
        mapRef.current?.remove();
      } catch {
        /* noop */
      }
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []);

  // Перерисовка маркеров при изменении rows.
  useEffect(() => {
    if (!ready) return;
    const cluster = clusterRef.current;
    const map = mapRef.current;
    if (!cluster || !map) return;

    (async () => {
      const L = (await import("leaflet")).default;
      cluster.clearLayers();

      if (rows.length === 0) return;

      const bounds = L.latLngBounds([]);
      for (const v of rows) {
        const lat = v.current_lat as number;
        const lng = v.current_lng as number;
        if (typeof lat !== "number" || typeof lng !== "number") continue;
        const st = statusOf(v, selfId);
        const color = STATUS_COLOR[st];
        const emoji = bodyEmoji(v.body_type);

        const html = `
          <div class="vmap-pin" style="--c:${color}">
            <div class="vmap-pin__body">
              <span class="vmap-pin__emoji">${emoji}</span>
            </div>
            <div class="vmap-pin__tail"></div>
          </div>`;
        const icon = L.divIcon({
          html,
          className: "vmap-pin-wrap",
          iconSize: [40, 48],
          iconAnchor: [20, 46],
          popupAnchor: [0, -42],
        });

        const popupHtml = renderPopupHtml(v, st);
        const marker = L.marker([lat, lng], { icon }).bindPopup(popupHtml, {
          maxWidth: 280,
          minWidth: 240,
        });

        marker.on("popupopen", (ev: any) => {
          const root: HTMLElement | undefined = ev.popup?.getElement();
          if (!root) return;
          const openBtn = root.querySelector<HTMLButtonElement>('[data-act="open"]');
          const takeBtn = root.querySelector<HTMLButtonElement>('[data-act="take"]');
          openBtn?.addEventListener("click", () => onOpen(v.id));
          if (onTake && st === "free" && takeBtn) {
            takeBtn.addEventListener("click", () => {
              takeBtn.disabled = true;
              onTake(v.id);
            });
          }
        });

        cluster.addLayer(marker);
        bounds.extend([lat, lng]);
      }

      try {
        if (rows.length === 1) {
          map.setView([rows[0].current_lat as number, rows[0].current_lng as number], 9);
        } else {
          map.fitBounds(bounds.pad(0.2), { maxZoom: 10 });
        }
      } catch {
        /* noop */
      }
      // На случай скрытого контейнера на момент маунта
      setTimeout(() => map.invalidateSize(), 0);
    })();
  }, [rows, ready, selfId, onOpen, onTake]);

  // На каждом обновлении rows перерисовываем — taking влияет только на disabled,
  // оставляем как есть (попап создаётся заново при popupopen).
  void taking;

  if (failed) {
    return (
      <div className="flex h-[55vh] min-h-[320px] flex-col items-center justify-center gap-2 p-4 text-center sm:h-[60vh]">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <div className="text-sm font-medium">Карта недоступна</div>
        <div className="max-w-md text-xs text-muted-foreground">
          Не удалось загрузить карту. Машины доступны в списке справа.
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-[55vh] min-h-[320px] w-full bg-muted/30 sm:h-[60vh]"
      style={{ zIndex: 0 }}
    />
  );
}

function renderPopupHtml(v: FreeVehicleRow, st: Status): string {
  const body = escapeHtml(getVehicleBodyTypeLabel(v.body_type) || v.body_type || "—");
  const city = escapeHtml(v.current_city ?? v.home_city ?? "—");
  const ready = v.ready_to_cities?.length ? escapeHtml(v.ready_to_cities.slice(0, 4).join(", ")) : "";
  const carrier = escapeHtml(v.carrier?.name ?? "—");
  const driver = escapeHtml(v.driver?.full_name ?? "—");
  const km = v.minimum_km_rate ? `${formatNum(v.minimum_km_rate)} ₽/км` : "";
  const trip = v.minimum_trip_rate ? `${formatNum(v.minimum_trip_rate)} ₽/рейс` : "";
  const rate = [km, trip].filter(Boolean).join(" · ");
  const readyFrom = v.ready_date ? `Готов с ${escapeHtml(v.ready_date)}` : "";
  const statusBg =
    st === "free" ? "#10b981" : st === "mine" ? "#3b82f6" : st === "busy" ? "#ef4444" : "#9ca3af";
  const takeBtn =
    st === "free"
      ? `<button data-act="take" style="flex:1;padding:6px 8px;border-radius:6px;border:0;background:#0f172a;color:#fff;font-size:12px;cursor:pointer">Взять</button>`
      : "";

  return `
    <div style="font:13px/1.4 system-ui;color:#0f172a">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">
        <div style="font-weight:600;display:flex;align-items:center;gap:6px">
          <span style="font-size:18px;line-height:1">${bodyEmoji(v.body_type)}</span>
          <span>${body}</span>
        </div>
        <span style="background:${statusBg};color:#fff;border-radius:9999px;padding:2px 8px;font-size:11px;font-weight:500">
          ${escapeHtml(STATUS_LABEL[st])}
        </span>
      </div>
      <div style="color:#475569;font-size:12px;display:grid;grid-template-columns:1fr 1fr;gap:2px 8px">
        <div><b style="color:#334155">Тоннаж:</b> ${v.payload_kg != null ? (v.payload_kg / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " т" : "—"}</div>
        <div><b style="color:#334155">Объём:</b> ${v.volume_m3 != null ? formatNum(v.volume_m3) + " м³" : "—"}</div>
      </div>
      <div style="margin-top:4px;color:#475569;font-size:12px">
        <b style="color:#334155">Город:</b> ${city}
        ${ready ? `<br/><b style="color:#334155">Куда готов:</b> ${ready}` : ""}
      </div>
      <div style="margin-top:4px;color:#475569;font-size:12px">
        <b style="color:#334155">Перевозчик:</b> ${carrier}<br/>
        <b style="color:#334155">Водитель:</b> ${driver}
      </div>
      ${rate ? `<div style="margin-top:4px;color:#475569;font-size:12px"><b style="color:#334155">Ставка:</b> ${rate}</div>` : ""}
      ${readyFrom ? `<div style="margin-top:2px;color:#475569;font-size:12px">${readyFrom}</div>` : ""}
      <div style="display:flex;gap:6px;margin-top:8px">
        <button data-act="open" style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;font-size:12px;cursor:pointer">Открыть</button>
        ${takeBtn}
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function formatNum(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

/* -------------------- Route preview (для предложения перевозчику) --------------------
 * Оставляем static-карту Я.Карт — простое превью маршрута, экспортируется
 * для src/components/carrier/CarrierRequestsBlock.tsx.
 */

export interface RoutePreviewPoint {
  lat?: number | null;
  lng?: number | null;
  city?: string | null;
  address?: string | null;
  label?: string | null;
}

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
      ) : (
        <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
          {(a.city ?? "—") + " → " + (b.city ?? "—")}
        </div>
      )}
    </div>
  );
}

