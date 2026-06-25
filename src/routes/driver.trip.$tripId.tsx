import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiGetAuth, apiPost } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  TRIP_STATUS_BADGE,
  TRIP_STATUS_LABEL,
  nextDriverAction,
  type TripPoint,
  type TripStatus,
} from "@/lib/dispatcher/trip-status";
import { formatTons } from "@/lib/units";
import {
  ChevronLeft,
  Truck,
  MapPin,
  Phone,
  Navigation,
  Package,
  FileText,
  Clock,
  Camera,
  Loader2,
} from "lucide-react";
import { useDriverTripExecutionEnabled } from "@/lib/mvp-features";
import { DriverQrMockBlock } from "@/components/edo/DriverQrMockBlock";

export const Route = createFileRoute("/driver/trip/$tripId")({
  head: () => ({
    meta: [
      { title: "Рейс — Радиус Трек" },
      { name: "description", content: "Карточка рейса водителя" },
    ],
  }),
  component: TripDetailPage,
});

type Trip = {
  id: string;
  status: TripStatus;
  current_point_idx: number;
  cargo_summary: string | null;
  weight_kg: number | null;
  volume_m3: number | null;
  body_type: string | null;
  rate: number | null;
  rate_visible_to_driver: boolean;
  dispatcher_contact: string | null;
  comment: string | null;
};

type Point = TripPoint & {
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  scheduled_at: string | null;
  comment: string | null;
};

type DocRow = {
  id: string;
  kind: string;
  storage_path: string;
  point_id: string | null;
  required: boolean;
  created_at: string;
};

type Resp = {
  trip: Trip;
  points: Point[];
  events: Array<{ id: string; event: string; at: string; payload: unknown }>;
  documents: DocRow[];
};

function TripDetailPage() {
  const { tripId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const tripExecutionEnabled = useDriverTripExecutionEnabled();

  const { data, isLoading, error } = useQuery({
    queryKey: ["driver-trip", tripId],
    queryFn: () => apiGetAuth<Resp>(`/api/driver/trips/${tripId}`),
    refetchOnWindowFocus: true,
  });

  const advance = useMutation({
    mutationFn: async (vars: { next: TripStatus; pointId: string | null }) =>
      apiPost(`/api/driver/trips/${tripId}/advance`, vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["driver-trip", tripId] });
      qc.invalidateQueries({ queryKey: ["driver-trips"] });
      toast.success("Статус обновлён");
    },
    onError: (e) => {
      console.error("[trip-advance]", e);
      toast.error("Не удалось сохранить статус. Попробуйте ещё раз.");
    },
  });

  async function handleFile(file: File, pointId: string | null) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("bucket", "delivery-photos");
      form.append("file", file);
      const up = await apiPost<{ storage_path: string }>("/api/storage/upload", form);
      await apiPost(`/api/driver/trips/${tripId}/documents`, {
        kind: pointId ? "point_photo" : "trip_photo",
        storage_path: up.storage_path,
        point_id: pointId,
      });
      qc.invalidateQueries({ queryKey: ["driver-trip", tripId] });
      toast.success("Файл загружен");
    } catch (e) {
      console.error("[trip-upload]", e);
      toast.error("Документ не загрузился. Проверьте файл или интернет.");
    } finally {
      setUploading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background p-4 text-muted-foreground">
        Загрузка…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-[100dvh] bg-background p-4">
        <p className="mb-3 text-muted-foreground">
          Не удалось загрузить задание. Проверьте интернет.
        </p>
        <Button onClick={() => navigate({ to: "/driver" })} variant="outline" size="sm">
          Назад
        </Button>
      </div>
    );
  }

  const { trip, points, events, documents } = data;
  const next = nextDriverAction(trip.status, points);
  const fromCity = points.find((p) => p.kind === "pickup")?.city;
  const toCity = [...points].reverse().find((p) => p.kind === "dropoff")?.city;

  if (!tripExecutionEnabled) {
    return (
      <div className="min-h-[100dvh] bg-background p-4">
        <header className="mb-4 flex items-center gap-2">
          <Link to="/driver">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {fromCity ?? "—"} → {toCity ?? "—"}
            </div>
            <Badge className={`mt-0.5 ${TRIP_STATUS_BADGE[trip.status]}`} variant="outline">
              {TRIP_STATUS_LABEL[trip.status]}
            </Badge>
          </div>
        </header>
        <div className="mx-auto max-w-2xl space-y-3">
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <div className="mb-2 font-semibold">Перевозчик принял груз, ожидайте задание от диспетчера.</div>
            <p className="text-muted-foreground">
              Сейчас полный сценарий выполнения рейса временно отключён. Передайте подтверждение готовности перевозчику или нажмите «Свободен / Готов к работе» в кабинете водителя.
            </p>
          </div>
          {trip.dispatcher_contact && (
            <div className="rounded-lg border border-border bg-card p-3 text-sm">
              <div className="text-xs text-muted-foreground">Диспетчер</div>
              <div className="font-medium">{trip.dispatcher_contact}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-[calc(env(safe-area-inset-bottom)+96px)]">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-3">
          <Link to="/driver">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {fromCity ?? "—"} → {toCity ?? "—"}
            </div>
            <Badge className={`mt-0.5 ${TRIP_STATUS_BADGE[trip.status]}`} variant="outline">
              {TRIP_STATUS_LABEL[trip.status]}
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-3 py-4">
        {/* Маршрут */}
        <section className="rounded-lg border border-border bg-card p-3">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <MapPin className="h-4 w-4" /> Маршрут
          </h2>
          <ol className="space-y-3">
            {points.map((p, i) => (
              <li key={p.id} className="border-l-2 border-primary/40 pl-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase text-muted-foreground">
                    {i + 1}. {p.kind === "pickup" ? "Загрузка" : p.kind === "dropoff" ? "Выгрузка" : "Точка"}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {p.status === "done" ? "✓" : p.status === "arrived" ? "На месте" : "Ожидает"}
                  </Badge>
                </div>
                <div className="mt-1 text-sm font-medium">
                  {[p.city, p.address].filter(Boolean).join(", ") || "Адрес не указан"}
                </div>
                {p.scheduled_at && (
                  <div className="text-xs text-muted-foreground">
                    {new Date(p.scheduled_at).toLocaleString("ru-RU")}
                  </div>
                )}
                {(p.contact_name || p.contact_phone) && (
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <Phone className="h-3 w-3" />
                    {p.contact_phone ? (
                      <a className="underline" href={`tel:${p.contact_phone}`}>
                        {p.contact_name ?? p.contact_phone}
                      </a>
                    ) : (
                      <span>{p.contact_name}</span>
                    )}
                  </div>
                )}
                {p.comment && (
                  <div className="mt-1 text-xs text-muted-foreground">{p.comment}</div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {(p.lat && p.lng) || p.address ? (
                    <a
                      href={
                        p.lat && p.lng
                          ? `yandexnavi://build_route_on_map?lat_to=${p.lat}&lon_to=${p.lng}`
                          : `https://yandex.ru/maps/?text=${encodeURIComponent([p.city, p.address].filter(Boolean).join(", "))}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"
                    >
                      <Navigation className="h-3 w-3" /> Навигатор
                    </a>
                  ) : null}
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-xs">
                    <Camera className="h-3 w-3" /> Фото точки
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleFile(f, p.id);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Груз */}
        <section className="rounded-lg border border-border bg-card p-3">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Package className="h-4 w-4" /> Груз
          </h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {trip.cargo_summary && (
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Описание</dt>
                <dd>{trip.cargo_summary}</dd>
              </div>
            )}
            {trip.weight_kg != null && (
              <div>
                <dt className="text-xs text-muted-foreground">Вес</dt>
                <dd>{formatTons(trip.weight_kg)} т</dd>
              </div>
            )}
            {trip.volume_m3 != null && (
              <div>
                <dt className="text-xs text-muted-foreground">Объём</dt>
                <dd>{trip.volume_m3} м³</dd>
              </div>
            )}
            {trip.body_type && (
              <div>
                <dt className="text-xs text-muted-foreground">Кузов</dt>
                <dd>{trip.body_type}</dd>
              </div>
            )}
            {trip.rate_visible_to_driver && trip.rate != null && (
              <div>
                <dt className="text-xs text-muted-foreground">Ставка</dt>
                <dd>{trip.rate} ₽</dd>
              </div>
            )}
          </dl>
          {trip.comment && (
            <p className="mt-2 text-xs text-muted-foreground">{trip.comment}</p>
          )}
        </section>

        {/* Контакты диспетчера */}
        {trip.dispatcher_contact && (
          <section className="rounded-lg border border-border bg-card p-3">
            <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
              <Phone className="h-4 w-4" /> Диспетчер
            </h2>
            <a className="text-sm underline" href={`tel:${trip.dispatcher_contact}`}>
              {trip.dispatcher_contact}
            </a>
          </section>
        )}

        {/* QR для проверки ГИБДД (тестовый, без ГИС ЭПД) */}
        <DriverTripQrSection tripId={trip.id} />

        {/* Документы */}
        <section className="rounded-lg border border-border bg-card p-3">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <FileText className="h-4 w-4" /> Документы
          </h2>
          <div className="space-y-1 text-xs">
            {documents.length === 0 && (
              <p className="text-muted-foreground">Документов пока нет.</p>
            )}
            {documents.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
                <span className="truncate">{d.kind}</span>
                <span className="text-muted-foreground">
                  {new Date(d.created_at).toLocaleString("ru-RU")}
                </span>
              </div>
            ))}
          </div>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Загрузить документ
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f, null);
                e.target.value = "";
              }}
            />
          </label>
        </section>

        {/* История */}
        <section className="rounded-lg border border-border bg-card p-3">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Clock className="h-4 w-4" /> История
          </h2>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {events.length === 0 && <li>Пока пусто.</li>}
            {events.map((e) => (
              <li key={e.id}>
                {new Date(e.at).toLocaleString("ru-RU")} — {e.event}
              </li>
            ))}
          </ul>
        </section>
      </main>

      {/* Sticky action bar */}
      {next && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-3 backdrop-blur">
          <div className="mx-auto max-w-3xl">
            <Button
              size="lg"
              className="w-full"
              disabled={advance.isPending}
              onClick={() => advance.mutate({ next: next.next, pointId: next.pointId })}
            >
              {advance.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Truck className="mr-2 h-4 w-4" />
              )}
              {next.label}
            </Button>
          </div>
        </div>
      )}

      {!next && trip.status === "delivered" && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-emerald-50 px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-3 text-center text-sm font-medium text-emerald-800">
          Рейс завершён
        </div>
      )}
    </div>
  );
}
