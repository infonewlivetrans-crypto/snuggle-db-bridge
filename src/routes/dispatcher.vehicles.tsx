import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil, Archive, Eye, RotateCcw } from "lucide-react";
import { InviteLinkButton } from "@/components/dispatcher/InviteLinkButton";
import { EntityTableLayout } from "@/components/dispatcher/EntityTableLayout";
import { StatusBadge } from "@/components/dispatcher/StatusBadge";
import { VehicleForm } from "@/components/dispatcher/VehicleForm";
import { DispatcherDocumentsBlock } from "@/components/dispatcher/DispatcherDocumentsBlock";
import { CityCombobox } from "@/components/common/CityCombobox";
import { VehicleReadinessEditor } from "@/components/vehicles/VehicleReadinessEditor";
import { DispatcherPartnerCardBlock } from "@/components/dispatcher/DispatcherPartnerCardBlock";
import { vehiclesApi, driversApi, carriersApi } from "@/lib/dispatcher/api";
import type { CarrierDTO, DriverDTO, VehicleDTO } from "@/lib/dispatcher/types";
import type { VehicleCreateInput } from "@/lib/dispatcher/schemas";
import {
  LOAD_METHOD_LABELS,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABELS,
  VEHICLE_READY_MODE_LABELS,
  VEHICLE_LOCATION_SOURCE_LABELS,
  WEEKDAY_LABELS_SHORT,
  type LoadMethod,
} from "@/lib/dispatcher/statuses";
import { VEHICLE_BODY_TYPES, getVehicleBodyTypeLabel } from "@/lib/dispatcher/vehicle-options";

export const Route = createFileRoute("/dispatcher/vehicles")({
  component: VehiclesPage,
});

const SORT_OPTIONS = [
  { value: "created", label: "По дате создания" },
  { value: "km_rate", label: "Мин. ставка за км" },
  { value: "trip_rate", label: "Мин. ставка за рейс" },
  { value: "ready_date", label: "Дата готовности" },
  { value: "city", label: "Город" },
  { value: "status", label: "Статус" },
];

function VehiclesPage() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<VehicleDTO[]>([]);
  const [carriers, setCarriers] = useState<CarrierDTO[]>([]);
  const [drivers, setDrivers] = useState<DriverDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string>("all");
  const [city, setCity] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [readyToday, setReadyToday] = useState(false);
  const [archived, setArchived] = useState<"hide" | "only" | "all">("hide");
  const [sortKey, setSortKey] = useState<string>("created");
  const [orderAsc, setOrderAsc] = useState(false);
  const [editing, setEditing] = useState<VehicleDTO | null>(null);
  const [viewing, setViewing] = useState<VehicleDTO | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await vehiclesApi.list({
        status, city,
        body_type: bodyType || "",
        ready_today: readyToday ? "true" : "",
        archived,
        sort: sortKey === "created" ? "" : sortKey,
        order: orderAsc ? "asc" : "desc",
        limit: 200,
      });
      setRows(res.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  const loadDeps = async () => {
    try {
      const [c, d] = await Promise.all([
        carriersApi.list({ limit: 500 }),
        driversApi.list({ limit: 500 }),
      ]);
      setCarriers(c.rows);
      setDrivers(d.rows);
    } catch {
      // silent
    }
  };

  useEffect(() => { loadDeps(); }, []);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, city, bodyType, readyToday, archived, sortKey, orderAsc]);

  const handleRestore = async (id: string) => {
    if (!confirm("Восстановить транспорт из архива?")) return;
    try {
      await vehiclesApi.update(id, { dispatcher_status: "new" } as never);
      toast.success("Восстановлен");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const invalidateMapAndDashboard = () => {
    qc.invalidateQueries({ queryKey: ["free-vehicles"] });
    qc.invalidateQueries({ queryKey: ["dispatcher-dashboard"] });
    qc.invalidateQueries({ queryKey: ["dispatcher-vehicles"] });
  };

  const handleSubmit = async (data: VehicleCreateInput) => {
    setSubmitting(true);
    try {
      if (editing) await vehiclesApi.update(editing.id, data);
      else await vehiclesApi.create(data);
      toast.success(editing ? "Транспорт обновлён" : "Транспорт добавлен");
      setDialogOpen(false);
      setEditing(null);
      await load();
      invalidateMapAndDashboard();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async (id: string) => {
    if (!confirm("Архивировать транспорт?")) return;
    try {
      await vehiclesApi.archive(id);
      toast.success("Архивирован");
      await load();
      invalidateMapAndDashboard();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const handleStatusChange = async (row: VehicleDTO, v: string) => {
    try {
      await vehiclesApi.update(row.id, { dispatcher_status: v as VehicleCreateInput["dispatcher_status"] });
      toast.success("Статус обновлён");
      await load();
      invalidateMapAndDashboard();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const carrierName = (id: string | null) => id ? carriers.find((c) => c.id === id)?.name ?? "—" : "—";
  const driverName = (id: string | null) => id ? drivers.find((d) => d.id === id)?.full_name ?? "—" : "—";

  const fmtMoney = (n: number | null) => n == null ? "—" : `${n.toLocaleString("ru-RU")} ₽`;
  const fmtDim = (v: VehicleDTO) => {
    const parts = [v.length_m, v.width_m, v.height_m].filter((x) => x != null);
    return parts.length === 3 ? parts.join(" × ") + " м" : "—";
  };

  return (
    <EntityTableLayout
      title="Транспорт (AI-диспетчер)"
      onCreate={() => { setEditing(null); setDialogOpen(true); }}
      toolbar={
        <>
          <div className="w-40"><CityCombobox value={city} onChange={setCity} placeholder="Город" size="sm" /></div>
          <Select value={bodyType || "all"} onValueChange={(v) => setBodyType(v === "all" ? "" : v)}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Тип кузова" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы кузова</SelectItem>
              {VEHICLE_BODY_TYPES.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Статус" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {VEHICLE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{VEHICLE_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={readyToday ? "default" : "outline"}
            size="sm"
            onClick={() => setReadyToday((p) => !p)}
          >
            Готовы сегодня
          </Button>
          <Select value={sortKey} onValueChange={setSortKey}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Сортировка" /></SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={archived} onValueChange={(v) => setArchived(v as "hide" | "only" | "all")}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hide">Активные</SelectItem>
              <SelectItem value="only">Архив</SelectItem>
              <SelectItem value="all">Все</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setOrderAsc((p) => !p)}>
            {orderAsc ? "↑ возр." : "↓ убыв."}
          </Button>
        </>
      }
    >
      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Тип / кузов</TableHead>
              <TableHead>Г/п, объём</TableHead>
              <TableHead>Габариты</TableHead>
              <TableHead>Загрузка</TableHead>
              <TableHead>Город</TableHead>
              <TableHead>Готов</TableHead>
              <TableHead>Водитель</TableHead>
              <TableHead>Ставки</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Загрузка…</TableCell></TableRow>}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Ничего не найдено</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setViewing(r)}>
                <TableCell className="font-medium">
                  <div>{r.vehicle_kind ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{getVehicleBodyTypeLabel(r.body_type)}</div>
                </TableCell>
                <TableCell>
                  <div>{r.payload_kg != null ? `${(r.payload_kg / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} т` : "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.volume_m3 != null ? `${r.volume_m3} м³` : ""}</div>
                </TableCell>
                <TableCell className="text-xs">{fmtDim(r)}</TableCell>
                <TableCell className="text-xs">
                  {(r.load_methods ?? []).map((m) => LOAD_METHOD_LABELS[m as LoadMethod] ?? m).join(", ") || "—"}
                </TableCell>
                <TableCell>{r.home_city ?? "—"}</TableCell>
                <TableCell className="text-xs">{r.ready_date ?? "—"}</TableCell>
                <TableCell className="text-xs">{driverName(r.dispatcher_driver_ext_id)}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  <div>км: {fmtMoney(r.minimum_km_rate)}</div>
                  <div>рейс: {fmtMoney(r.minimum_trip_rate)}</div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Select value={r.dispatcher_status} onValueChange={(v) => handleStatusChange(r, v)}>
                    <SelectTrigger className="h-7 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VEHICLE_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{VEHICLE_STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" onClick={() => setViewing(r)} title="Просмотр"><Eye className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setDialogOpen(true); }} title="Редактировать"><Pencil className="h-4 w-4" /></Button>
                  {r.dispatcher_status === "archive" ? (
                    <Button size="icon" variant="ghost" onClick={() => handleRestore(r.id)} title="Восстановить"><RotateCcw className="h-4 w-4" /></Button>
                  ) : (
                    <Button size="icon" variant="ghost" onClick={() => handleArchive(r.id)} title="Архивировать"><Archive className="h-4 w-4" /></Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] p-0 flex flex-col gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b bg-background sticky top-0 z-10 shrink-0">
            <DialogTitle>{editing ? "Редактировать транспорт" : "Новый транспорт"}</DialogTitle>
            <DialogDescription className="text-xs">
              Эти данные обычно заполняет перевозчик или водитель. Админ/диспетчер редактирует их только для проверки или ручной корректировки.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4">
            <VehicleForm initial={editing} carriers={carriers} drivers={drivers} submitting={submitting}
              onCancel={() => { setDialogOpen(false); setEditing(null); }}
              onSubmit={handleSubmit}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] p-0 flex flex-col gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b bg-background sticky top-0 z-10 shrink-0">
            <DialogTitle>Транспорт</DialogTitle>
            <DialogDescription>Карточка транспортного средства.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4">
          {viewing && (() => {
            const v = viewing as VehicleDTO & {
              current_city?: string | null;
              current_lat?: number | null;
              current_lng?: number | null;
              location_source?: string | null;
              location_updated_at?: string | null;
              ready_radius_km?: number | null;
              ready_mode?: string | null;
              ready_from?: string | null;
              ready_weekdays?: number[] | null;
            };
            const carrier = carriers.find((c) => c.id === v.dispatcher_carrier_ext_id);
            const driver = drivers.find((d) => d.id === v.dispatcher_driver_ext_id);
            const locText = v.current_city
              ? v.current_city
              : (v.current_lat != null && v.current_lng != null
                ? `${v.current_lat.toFixed(4)}, ${v.current_lng.toFixed(4)}`
                : (v.home_city ?? "—"));
            const srcLabel = v.location_source
              ? VEHICLE_LOCATION_SOURCE_LABELS[v.location_source as keyof typeof VEHICLE_LOCATION_SOURCE_LABELS] ?? v.location_source
              : "—";
            const readyModeLabel = v.ready_mode
              ? VEHICLE_READY_MODE_LABELS[v.ready_mode as keyof typeof VEHICLE_READY_MODE_LABELS] ?? v.ready_mode
              : "—";
            const weekdays = (v.ready_weekdays ?? []).map((d) => WEEKDAY_LABELS_SHORT[d - 1]).join(", ");
            return (
            <div className="space-y-2 text-sm">
              <Row label="Тип" value={v.vehicle_kind ?? "—"} />
              <Row label="Кузов" value={v.body_type ? getVehicleBodyTypeLabel(v.body_type) : "—"} />
              <Row label="Грузоподъёмность" value={v.payload_kg != null ? `${(v.payload_kg / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} т` : "—"} />
              <Row label="Объём" value={v.volume_m3 != null ? `${v.volume_m3} м³` : "—"} />
              <Row label="Габариты" value={fmtDim(v)} />
              <Row label="Способы загрузки" value={(v.load_methods ?? []).map((m) => LOAD_METHOD_LABELS[m as LoadMethod] ?? m).join(", ") || "—"} />
              <Row label="Город базирования" value={v.home_city ?? "—"} />
              <Row label="Текущее местоположение" value={locText} />
              <Row label="Источник местоположения" value={
                <span>
                  {srcLabel}
                  {v.location_updated_at && (
                    <span className="text-xs text-muted-foreground"> · обновлено {new Date(v.location_updated_at).toLocaleString("ru-RU")}</span>
                  )}
                </span>
              } />
              <Row label="Радиус готовности" value={v.ready_radius_km != null ? `${v.ready_radius_km} км` : "—"} />
              <Row label="Режим готовности" value={readyModeLabel} />
              {v.ready_from && <Row label="Готов с даты" value={v.ready_from} />}
              {weekdays && <Row label="Дни недели" value={weekdays} />}
              <Row label="Куда готов ехать" value={(v.ready_to_cities ?? []).join(", ") || "—"} />
              <Row label="Дата готовности" value={v.ready_date ?? "—"} />
              <Row label="Перевозчик" value={
                carrier
                  ? `${carrier.name ?? "—"}${carrier.phone ? " · " + carrier.phone : ""}`
                  : "—"
              } />
              <Row label="Водитель" value={
                driver
                  ? `${driver.full_name ?? "—"}${driver.phone ? " · " + driver.phone : ""}`
                  : "—"
              } />
              <Row label="Мин. ставка за рейс" value={fmtMoney(v.minimum_trip_rate)} />
              <Row label="Мин. ставка за км" value={fmtMoney(v.minimum_km_rate)} />
              <Row label="Ставка по городу" value={fmtMoney(v.city_rate)} />
              <Row label="Ставка за точку" value={fmtMoney(v.point_rate)} />
              <Row label="Комментарий по ставке" value={v.rate_comment ?? "—"} />
              <Row label="Статус" value={<StatusBadge status={v.dispatcher_status} label={VEHICLE_STATUS_LABELS[v.dispatcher_status as keyof typeof VEHICLE_STATUS_LABELS] ?? v.dispatcher_status} />} />
              <Row label="Комментарий" value={v.dispatcher_comment ?? "—"} />
              <DispatcherDocumentsBlock ownerType="vehicle" ownerId={v.id} />
              {v.dispatcher_carrier_ext_id && (
                <DispatcherPartnerCardBlock
                  carrierExtId={v.dispatcher_carrier_ext_id}
                  initialDriverId={v.dispatcher_driver_ext_id ?? null}
                  initialVehicleId={v.id}
                />
              )}
              <div className="rounded-md border p-3 space-y-2">
                <div className="font-medium">Ссылка для заполнения данных транспорта</div>
                <div className="text-xs text-muted-foreground">
                  Отправьте водителю или перевозчику ссылку — он заполнит данные транспорта и прикрепит документы.
                </div>
                <InviteLinkButton entityType="vehicle" entityId={v.id} inviteType="vehicle_registration" />
              </div>
            </div>
            );
          })()}
          </div>
        </DialogContent>
      </Dialog>
    </EntityTableLayout>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-44 text-muted-foreground">{label}</div>
      <div className="flex-1">{value}</div>
    </div>
  );
}
