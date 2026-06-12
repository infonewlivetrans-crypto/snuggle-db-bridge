import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Pencil, Archive, Eye } from "lucide-react";
import { InviteLinkButton } from "@/components/dispatcher/InviteLinkButton";
import { EntityTableLayout } from "@/components/dispatcher/EntityTableLayout";
import { StatusBadge } from "@/components/dispatcher/StatusBadge";
import { VehicleForm } from "@/components/dispatcher/VehicleForm";
import { DispatcherDocumentsBlock } from "@/components/dispatcher/DispatcherDocumentsBlock";
import { DispatcherPartnerCardBlock } from "@/components/dispatcher/DispatcherPartnerCardBlock";
import { vehiclesApi, driversApi, carriersApi } from "@/lib/dispatcher/api";
import type { CarrierDTO, DriverDTO, VehicleDTO } from "@/lib/dispatcher/types";
import type { VehicleCreateInput } from "@/lib/dispatcher/schemas";
import {
  LOAD_METHOD_LABELS,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABELS,
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
  const [rows, setRows] = useState<VehicleDTO[]>([]);
  const [carriers, setCarriers] = useState<CarrierDTO[]>([]);
  const [drivers, setDrivers] = useState<DriverDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string>("all");
  const [city, setCity] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [readyToday, setReadyToday] = useState(false);
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
  }, [status, city, bodyType, readyToday, sortKey, orderAsc]);

  const handleSubmit = async (data: VehicleCreateInput) => {
    setSubmitting(true);
    try {
      if (editing) await vehiclesApi.update(editing.id, data);
      else await vehiclesApi.create(data);
      toast.success(editing ? "Транспорт обновлён" : "Транспорт добавлен");
      setDialogOpen(false);
      setEditing(null);
      await load();
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const handleStatusChange = async (row: VehicleDTO, v: string) => {
    try {
      await vehiclesApi.update(row.id, { dispatcher_status: v as VehicleCreateInput["dispatcher_status"] });
      toast.success("Статус обновлён");
      await load();
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
          <Input placeholder="Город" value={city} onChange={(e) => setCity(e.target.value)} className="w-40" />
          <Input placeholder="Тип кузова" value={bodyType} onChange={(e) => setBodyType(e.target.value)} className="w-44" />
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
                  <div className="text-xs text-muted-foreground">{r.body_type ?? ""}</div>
                </TableCell>
                <TableCell>
                  <div>{r.payload_kg != null ? `${r.payload_kg} кг` : "—"}</div>
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
                  <Button size="icon" variant="ghost" onClick={() => setViewing(r)}><Eye className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <InviteLinkButton entityType="vehicle" entityId={r.id} inviteType="vehicle_registration" />
                  <Button size="icon" variant="ghost" onClick={() => handleArchive(r.id)}><Archive className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать транспорт" : "Новый транспорт"}</DialogTitle>
            <DialogDescription>Заполните данные транспорта и сохраните.</DialogDescription>
          </DialogHeader>
          <VehicleForm initial={editing} carriers={carriers} drivers={drivers} submitting={submitting}
            onCancel={() => { setDialogOpen(false); setEditing(null); }}
            onSubmit={handleSubmit}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Транспорт</DialogTitle>
            <DialogDescription>Карточка транспортного средства.</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-2 text-sm">
              <Row label="Тип" value={viewing.vehicle_kind ?? "—"} />
              <Row label="Кузов" value={viewing.body_type ?? "—"} />
              <Row label="Грузоподъёмность" value={viewing.payload_kg != null ? `${viewing.payload_kg} кг` : "—"} />
              <Row label="Объём" value={viewing.volume_m3 != null ? `${viewing.volume_m3} м³` : "—"} />
              <Row label="Габариты" value={fmtDim(viewing)} />
              <Row label="Способы загрузки" value={(viewing.load_methods ?? []).map((m) => LOAD_METHOD_LABELS[m as LoadMethod] ?? m).join(", ") || "—"} />
              <Row label="Город нахождения" value={viewing.home_city ?? "—"} />
              <Row label="Куда готов ехать" value={(viewing.ready_to_cities ?? []).join(", ") || "—"} />
              <Row label="Дата готовности" value={viewing.ready_date ?? "—"} />
              <Row label="Перевозчик" value={carrierName(viewing.dispatcher_carrier_ext_id)} />
              <Row label="Водитель" value={driverName(viewing.dispatcher_driver_ext_id)} />
              <Row label="Мин. ставка за рейс" value={fmtMoney(viewing.minimum_trip_rate)} />
              <Row label="Мин. ставка за км" value={fmtMoney(viewing.minimum_km_rate)} />
              <Row label="Ставка по городу" value={fmtMoney(viewing.city_rate)} />
              <Row label="Ставка за точку" value={fmtMoney(viewing.point_rate)} />
              <Row label="Комментарий по ставке" value={viewing.rate_comment ?? "—"} />
              <Row label="Статус" value={<StatusBadge status={viewing.dispatcher_status} label={VEHICLE_STATUS_LABELS[viewing.dispatcher_status as keyof typeof VEHICLE_STATUS_LABELS] ?? viewing.dispatcher_status} />} />
              <Row label="Комментарий" value={viewing.dispatcher_comment ?? "—"} />
              <DispatcherDocumentsBlock ownerType="vehicle" ownerId={viewing.id} />
              {viewing.dispatcher_carrier_ext_id && (
                <DispatcherPartnerCardBlock
                  carrierExtId={viewing.dispatcher_carrier_ext_id}
                  initialDriverId={viewing.dispatcher_driver_ext_id ?? null}
                  initialVehicleId={viewing.id}
                />
              )}
            </div>
          )}
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
