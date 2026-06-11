import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Truck, Phone, MapPin, Loader2, ExternalLink, Map as MapIcon, List as ListIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { freeVehiclesApi, vehiclesApi, type FreeVehicleRow } from "@/lib/dispatcher/api";
import { AddFoundFreightDialog } from "./AddFoundFreightDialog";
import { VehicleFreightsBlock } from "./VehicleFreightsBlock";
import { VehicleMapPanel } from "./VehicleMapPanel";

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("ru-RU");
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("ru-RU") : "—";
const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("ru-RU") : "—";

type WorkStatus = "free" | "in_work" | "mine" | "all";
type View = "map" | "list";

export function FreeVehiclesBlock() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("map");
  const [tab, setTab] = useState<WorkStatus>("free");
  const [city, setCity] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["free-vehicles", tab, city, search],
    queryFn: () =>
      freeVehiclesApi.list({
        status: tab,
        city: city || undefined,
        search: search || undefined,
        limit: 50,
      }),
    refetchInterval: 30_000,
  });

  const rows = data?.rows ?? [];
  const openRow = useMemo(
    () => rows.find((r) => r.id === openId) ?? null,
    [rows, openId],
  );

  const takeMut = useMutation({
    mutationFn: (id: string) => freeVehiclesApi.takeWork(id),
    onSuccess: () => {
      toast.success("Машина взята в работу");
      qc.invalidateQueries({ queryKey: ["free-vehicles"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Ошибка";
      toast.error(msg);
    },
  });

  const releaseMut = useMutation({
    mutationFn: (id: string) => freeVehiclesApi.releaseWork(id),
    onSuccess: () => {
      toast.success("Машина освобождена");
      qc.invalidateQueries({ queryKey: ["free-vehicles"] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    },
  });

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Truck className="h-5 w-5" />
          <span>Свободные машины</span>
          <Badge variant="outline">{data?.total ?? 0}</Badge>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Город"
            className="h-8 w-32"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск"
            className="h-8 w-40"
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as WorkStatus)} className="mb-3">
        <TabsList>
          <TabsTrigger value="free">Свободные</TabsTrigger>
          <TabsTrigger value="mine">В работе у меня</TabsTrigger>
          <TabsTrigger value="in_work">Взяты диспетчерами</TabsTrigger>
          <TabsTrigger value="all">Все</TabsTrigger>
        </TabsList>
      </Tabs>

      <Tabs value={view} onValueChange={(v) => setView(v as View)} className="mb-3">
        <TabsList>
          <TabsTrigger value="map">
            <MapIcon className="mr-1 h-3.5 w-3.5" /> Карта
          </TabsTrigger>
          <TabsTrigger value="list">
            <ListIcon className="mr-1 h-3.5 w-3.5" /> Список
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Ошибка: {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
          Нет машин по выбранному фильтру
        </div>
      ) : view === "map" ? (
        <VehicleMapPanel
          rows={rows}
          selfId={data?.user_id ?? null}
          onOpen={(id) => setOpenId(id)}
          onTake={(id) => takeMut.mutate(id)}
          taking={takeMut.isPending}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((v) => (
            <VehicleListCard
              key={v.id}
              v={v}
              onOpen={() => setOpenId(v.id)}
              onTake={() => takeMut.mutate(v.id)}
              onRelease={() => releaseMut.mutate(v.id)}
              taking={takeMut.isPending}
              releasing={releaseMut.isPending}
            />
          ))}
        </div>
      )}

      <VehicleDetailsDialog
        row={openRow}
        onClose={() => setOpenId(null)}
        onTake={(id) => takeMut.mutate(id)}
        onRelease={(id) => releaseMut.mutate(id)}
        taking={takeMut.isPending}
        releasing={releaseMut.isPending}
      />
    </section>
  );
}

function VehicleListCard({
  v,
  onOpen,
  onTake,
  onRelease,
  taking,
  releasing,
}: {
  v: FreeVehicleRow;
  onOpen: () => void;
  onTake: () => void;
  onRelease: () => void;
  taking: boolean;
  releasing: boolean;
}) {
  const inWork = v.dispatcher_work_status === "in_work" || v.dispatcher_work_status === "offered" || v.dispatcher_work_status === "accepted";
  const byOther = inWork && v.dispatcher_taken_by && !v.taken_by_self;
  const byMe = inWork && v.taken_by_self;
  const driverPhone = v.driver?.phone ?? null;

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {v.vehicle_kind ?? "—"}
            {v.body_type ? <span className="text-muted-foreground"> · {v.body_type}</span> : null}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {v.current_city ?? v.home_city ?? "—"}
          </div>
        </div>
        {byMe ? (
          <Badge className="bg-primary text-primary-foreground">У меня</Badge>
        ) : byOther ? (
          <Badge variant="destructive">В работе</Badge>
        ) : (
          <Badge variant="secondary">Свободна</Badge>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
        <div>Г/п: {fmtNum(v.payload_kg)} кг</div>
        <div>V: {fmtNum(v.volume_m3)} м³</div>
        <div>Готов: {fmtDate(v.ready_date)}</div>
        <div>₽/км: {fmtNum(v.minimum_km_rate)}</div>
        <div className="col-span-2 truncate">
          Водитель: {v.driver?.full_name ?? "—"}
        </div>
        <div className="col-span-2 truncate">
          Перевозчик: {v.carrier?.name ?? "—"}
        </div>
        {v.ready_to_cities && v.ready_to_cities.length > 0 ? (
          <div className="col-span-2 truncate">
            Готов в: {v.ready_to_cities.join(", ")}
          </div>
        ) : null}
        {byOther ? (
          <div className="col-span-2 truncate text-destructive">
            Взял: {v.taken_by_profile?.full_name ?? v.taken_by_profile?.email ?? "другой диспетчер"} · {fmtDateTime(v.dispatcher_taken_at)}
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onOpen} className="flex-1">
          Открыть
        </Button>
        {byMe ? (
          <Button size="sm" variant="secondary" onClick={onRelease} disabled={releasing} className="flex-1">
            Освободить
          </Button>
        ) : byOther ? (
          <Button size="sm" disabled className="flex-1">
            В работе
          </Button>
        ) : (
          <Button size="sm" onClick={onTake} disabled={taking} className="flex-1">
            Взять
          </Button>
        )}
        {driverPhone ? (
          <Button asChild size="sm" variant="ghost" className="px-2">
            <a href={`tel:${driverPhone}`}>
              <Phone className="h-3 w-3" />
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function VehicleDetailsDialog({
  row,
  onClose,
  onTake,
  onRelease,
  taking,
  releasing,
}: {
  row: FreeVehicleRow | null;
  onClose: () => void;
  onTake: (id: string) => void;
  onRelease: (id: string) => void;
  taking: boolean;
  releasing: boolean;
}) {
  const [freightDialogOpen, setFreightDialogOpen] = useState(false);
  if (!row) return null;
  const v = row;
  const byMe = v.taken_by_self && v.dispatcher_work_status === "in_work";
  const byOther = !v.taken_by_self && !!v.dispatcher_taken_by;

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {v.vehicle_kind ?? "Машина"}
            {v.body_type ? ` · ${v.body_type}` : ""}
          </DialogTitle>
          <DialogDescription>
            {(v.current_city ?? v.home_city ?? "—") + " → " + (v.ready_to_cities?.join(", ") || "—")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <Block title="Транспорт">
            <KV label="Кузов" v={v.body_type} />
            <KV label="Тоннаж, кг" v={fmtNum(v.payload_kg)} />
            <KV label="Объём, м³" v={fmtNum(v.volume_m3)} />
            <KV label="Габариты" v={`${fmtNum(v.length_m)}×${fmtNum(v.width_m)}×${fmtNum(v.height_m)} м`} />
            <KV label="Загрузка" v={v.load_methods?.join(", ") ?? null} />
            <KV label="Готов" v={fmtDate(v.ready_date)} />
            <KV label="Комм. готовности" v={v.ready_comment} />
            <KV label="Документы" v={v.docs_status} />
          </Block>

          <Block title="Ставки">
            <KV label="₽/км мин" v={fmtNum(v.minimum_km_rate)} />
            <KV label="₽/рейс мин" v={fmtNum(v.minimum_trip_rate)} />
            <KV label="₽/город" v={fmtNum(v.city_rate)} />
            <KV label="₽/точка" v={fmtNum(v.point_rate)} />
            <KV label="Комм. по ставке" v={v.rate_comment} />
          </Block>

          <Block title="Водитель">
            <KV label="ФИО" v={v.driver?.full_name} />
            <KV label="Телефон" v={v.driver?.phone} link={v.driver?.phone ? `tel:${v.driver.phone}` : null} />
            <KV label="WhatsApp" v={v.driver?.whatsapp} />
            <KV label="Telegram" v={v.driver?.telegram} />
            <KV label="Max" v={v.driver?.max_messenger} />
            <KV label="Email" v={v.driver?.email} link={v.driver?.email ? `mailto:${v.driver.email}` : null} />
            {v.driver?.id ? (
              <Button asChild size="sm" variant="ghost" className="mt-1 h-auto px-0 text-xs">
                <Link to="/dispatcher/drivers">
                  Открыть карточку <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            ) : null}
          </Block>

          <Block title="Перевозчик">
            <KV label="Компания" v={v.carrier?.name} />
            <KV label="ИНН" v={v.carrier?.inn} />
            <KV label="ATI ID" v={v.carrier?.ati_id} />
            <KV label="Телефон" v={v.carrier?.phone} link={v.carrier?.phone ? `tel:${v.carrier.phone}` : null} />
            <KV label="WhatsApp" v={v.carrier?.whatsapp} />
            <KV label="Telegram" v={v.carrier?.telegram} />
            <KV label="Max" v={v.carrier?.max_messenger} />
            <KV label="Email" v={v.carrier?.email} link={v.carrier?.email ? `mailto:${v.carrier.email}` : null} />
            <KV label="Верификация" v={v.carrier?.verification_status} />
            {v.carrier?.id ? (
              <Button asChild size="sm" variant="ghost" className="mt-1 h-auto px-0 text-xs">
                <Link to="/dispatcher/carriers">
                  Открыть карточку <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            ) : null}
          </Block>

          <div className="sm:col-span-2">
            <LocationEditBlock vehicle={v} />
          </div>


          {v.dispatcher_comment ? (
            <div className="sm:col-span-2">
              <Block title="Комментарий диспетчера">
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {v.dispatcher_comment}
                </div>
              </Block>
            </div>
          ) : null}

          {byOther ? (
            <div className="sm:col-span-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              Машина уже в работе у{" "}
              <strong>
                {v.taken_by_profile?.full_name ?? v.taken_by_profile?.email ?? "другого диспетчера"}
              </strong>{" "}
              с {fmtDateTime(v.dispatcher_taken_at)}
            </div>
          ) : null}

          {byMe ? (
            <div className="sm:col-span-2">
              <VehicleFreightsBlock
                vehicleId={v.id}
                carrierExtId={v.carrier?.id ?? null}
                driverExtId={v.driver?.id ?? null}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {v.driver?.phone ? (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${v.driver.phone}`}>Позвонить водителю</a>
            </Button>
          ) : null}
          {v.carrier?.phone ? (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${v.carrier.phone}`}>Позвонить перевозчику</a>
            </Button>
          ) : null}
          {byMe ? (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={() => setFreightDialogOpen(true)}
                disabled={!v.carrier?.id}
                title={!v.carrier?.id ? "Транспорт не привязан к перевозчику" : undefined}
              >
                Добавить найденный груз
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onRelease(v.id)} disabled={releasing}>
                Освободить
              </Button>
            </>
          ) : byOther ? (
            <Button size="sm" disabled title="Машина в работе у другого диспетчера">
              В работе у другого
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" disabled title="Сначала возьмите машину в работу">
                Добавить найденный груз
              </Button>
              <Button size="sm" onClick={() => onTake(v.id)} disabled={taking}>
                Взять в работу
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
      <AddFoundFreightDialog
        vehicle={v}
        open={freightDialogOpen}
        onOpenChange={setFreightDialogOpen}
      />
    </Dialog>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function KV({
  label,
  v,
  link,
}: {
  label: string;
  v: string | number | null | undefined;
  link?: string | null;
}) {
  const text = v == null || v === "" ? "—" : String(v);
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {link && text !== "—" ? (
        <a href={link} className="truncate font-medium text-foreground hover:underline">
          {text}
        </a>
      ) : (
        <span className="truncate font-medium text-foreground">{text}</span>
      )}
    </div>
  );
}

function LocationEditBlock({ vehicle }: { vehicle: FreeVehicleRow }) {
  const qc = useQueryClient();
  const [city, setCity] = useState(vehicle.current_city ?? "");
  const [lat, setLat] = useState(vehicle.current_lat == null ? "" : String(vehicle.current_lat));
  const [lng, setLng] = useState(vehicle.current_lng == null ? "" : String(vehicle.current_lng));
  const [readyTo, setReadyTo] = useState((vehicle.ready_to_cities ?? []).join(", "));
  const [readyComment, setReadyComment] = useState(vehicle.ready_comment ?? "");
  const [readyDate, setReadyDate] = useState(vehicle.ready_date ?? "");

  const saveMut = useMutation({
    mutationFn: () => {
      const latN = lat.trim() ? Number(lat.replace(",", ".")) : null;
      const lngN = lng.trim() ? Number(lng.replace(",", ".")) : null;
      return vehiclesApi.update(vehicle.id, {
        current_city: city.trim() || null,
        current_lat: latN != null && Number.isFinite(latN) ? latN : null,
        current_lng: lngN != null && Number.isFinite(lngN) ? lngN : null,
        ready_to_cities: readyTo
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        ready_comment: readyComment.trim() || null,
        ready_date: readyDate || null,
      });
    },
    onSuccess: () => {
      toast.success("Местоположение сохранено");
      qc.invalidateQueries({ queryKey: ["free-vehicles"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить"),
  });

  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Местоположение и готовность
        </div>
        <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Сохранить"}
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Текущий город</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} className="h-8" />
        </div>
        <div>
          <Label className="text-xs">Дата готовности</Label>
          <Input type="date" value={readyDate} onChange={(e) => setReadyDate(e.target.value)} className="h-8" />
        </div>
        <div>
          <Label className="text-xs">Широта (lat)</Label>
          <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="55.7558" className="h-8" inputMode="decimal" />
        </div>
        <div>
          <Label className="text-xs">Долгота (lng)</Label>
          <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="37.6173" className="h-8" inputMode="decimal" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Куда готов ехать (через запятую)</Label>
          <Input value={readyTo} onChange={(e) => setReadyTo(e.target.value)} className="h-8" placeholder="Москва, Санкт-Петербург" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Комментарий готовности</Label>
          <Textarea value={readyComment} onChange={(e) => setReadyComment(e.target.value)} rows={2} />
        </div>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        Координаты не обязательны. Без них машина отображается в блоке «Без координат».
      </div>
    </div>
  );
}
