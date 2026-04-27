import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Clock,
  MapPin,
  Phone,
  Plus,
  Save,
  Truck,
  User,
  Users,
  Trash2,
  CheckCircle2,
  PackageCheck,
  Undo2,
  RefreshCw,
  Pencil,
  UserX,
  UserCheck,
} from "lucide-react";
import {
  DEFAULT_BREAKS,
  DEFAULT_WORKING_HOURS,
  parseBreaks,
  parseWorkingHours,
  STAFF_ROLE_LABELS,
  WEEK_DAYS,
  WEEK_DAY_LABELS_FULL,
  type Break,
  type WarehouseFull,
  type WarehouseStaff,
  type WarehouseStaffRole,
  type WorkingHours,
  workingHoursSummary,
} from "@/lib/warehouses";
import {
  DOCK_SLOT_KIND_LABELS,
  DOCK_SLOT_KIND_SHORT,
  DOCK_SLOT_STATUS_BADGE,
  DOCK_SLOT_STATUS_LABELS,
  eta,
  shortTime,
  todayDateStr,
  type DockSlot,
  type DockSlotKind,
  type DockSlotStatus,
} from "@/lib/dock-slots";

export const Route = createFileRoute("/warehouses/$warehouseId")({
  head: () => ({ meta: [{ title: "Склад — Радиус Трек" }] }),
  component: WarehouseDetailPage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl p-6">
        <div className="rt-alert rt-alert-danger">Ошибка: {error.message}</div>
      </main>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl p-6">
        <div className="rt-alert rt-alert-warning">Склад не найден</div>
        <Link to="/warehouses" className="mt-4 inline-flex items-center gap-1 text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> К списку складов
        </Link>
      </main>
    </div>
  ),
});

function WarehouseDetailPage() {
  const { warehouseId } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [date, setDate] = useState<string>(todayDateStr());
  const [now, setNow] = useState<Date>(new Date());

  // Тикер для таймера прибытия (раз в 30 секунд достаточно)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const { data: warehouse, isLoading } = useQuery({
    queryKey: ["warehouse", warehouseId],
    queryFn: async (): Promise<WarehouseFull> => {
      const { data, error } = await db
        .from("warehouses")
        .select("*")
        .eq("id", warehouseId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return {
        ...(data as unknown as WarehouseFull),
        working_hours: parseWorkingHours((data as { working_hours?: unknown }).working_hours),
        breaks: parseBreaks((data as { breaks?: unknown }).breaks),
      };
    },
  });

  const { data: staff } = useQuery({
    queryKey: ["warehouse_staff", warehouseId],
    queryFn: async (): Promise<WarehouseStaff[]> => {
      const { data, error } = await db
        .from("warehouse_staff")
        .select("*")
        .eq("warehouse_id", warehouseId)
        .order("role", { ascending: true })
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WarehouseStaff[];
    },
  });

  const { data: slots, refetch: refetchSlots } = useQuery({
    queryKey: ["dock_slots", warehouseId, date],
    queryFn: async (): Promise<DockSlot[]> => {
      const { data, error } = await db
        .from("warehouse_dock_slots")
        .select("*")
        .eq("warehouse_id", warehouseId)
        .eq("slot_date", date)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as DockSlot[];
    },
  });

  // Realtime — слоты обновляются автоматически
  useEffect(() => {
    const channel = supabase
      .channel(`dock-slots-${warehouseId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "warehouse_dock_slots",
          filter: `warehouse_id=eq.${warehouseId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["dock_slots", warehouseId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [warehouseId, qc]);

  if (isLoading || !warehouse) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-6xl p-6 text-muted-foreground">Загрузка склада…</main>
      </div>
    );
  }

  const wh = warehouse;
  const hours = wh.working_hours as WorkingHours;
  const breaks = (wh.breaks ?? []) as Break[];

  const groups = groupSlots(slots ?? []);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <button
          onClick={() => router.history.back()}
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Назад
        </button>

        {/* Шапка склада */}
        <div className="rt-card mb-6 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                Склад
              </div>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                {wh.name}
              </h1>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {wh.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{wh.city}{wh.address ? `, ${wh.address}` : ""}</span>}
                {wh.manager_name && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />Начальник: {wh.manager_name}</span>}
                {wh.manager_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{wh.manager_phone}</span>}
              </div>
              <div className="mt-2 inline-flex items-center gap-1.5 text-sm">
                <Clock className="h-3.5 w-3.5 text-status-warning" />
                <span className="font-medium text-foreground">Часы работы:</span>
                <span className="text-muted-foreground">{workingHoursSummary(hours)}</span>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="schedule">
          <TabsList>
            <TabsTrigger value="schedule">Расписание дня</TabsTrigger>
            <TabsTrigger value="staff">Сотрудники</TabsTrigger>
            <TabsTrigger value="settings">Настройки склада</TabsTrigger>
          </TabsList>

          {/* ============ Расписание ============ */}
          <TabsContent value="schedule" className="mt-4">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Дата</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-44"
                  />
                  <Button variant="outline" size="sm" onClick={() => setDate(todayDateStr())}>
                    Сегодня
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => refetchSlots()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <NewSlotButton warehouseId={warehouseId} date={date} />
            </div>

            {(slots?.length ?? 0) === 0 ? (
              <div className="rt-card p-10 text-center text-sm text-muted-foreground">
                На эту дату ещё нет окон загрузки/приёмки.
                <br />
                Нажмите «Добавить окно», чтобы запланировать машину.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                <SlotColumn
                  title="Отгрузки"
                  icon={<Truck className="h-4 w-4" />}
                  slots={groups.shipment}
                  now={now}
                />
                <SlotColumn
                  title="Приёмка с завода"
                  icon={<PackageCheck className="h-4 w-4" />}
                  slots={groups.inbound_factory}
                  now={now}
                />
                <SlotColumn
                  title="Приёмка возврата"
                  icon={<Undo2 className="h-4 w-4" />}
                  slots={groups.inbound_return}
                  now={now}
                />
              </div>
            )}
          </TabsContent>

          {/* ============ Сотрудники ============ */}
          <TabsContent value="staff" className="mt-4">
            <StaffSection warehouseId={warehouseId} staff={staff ?? []} />
          </TabsContent>

          {/* ============ Настройки ============ */}
          <TabsContent value="settings" className="mt-4">
            <SettingsSection warehouse={wh} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ===================== Helpers =====================

function groupSlots(slots: DockSlot[]) {
  const out: Record<DockSlotKind, DockSlot[]> = {
    shipment: [],
    inbound_factory: [],
    inbound_return: [],
  };
  for (const s of slots) out[s.slot_kind].push(s);
  return out;
}

// ===================== Колонка слотов =====================

function SlotColumn({
  title,
  icon,
  slots,
  now,
}: {
  title: string;
  icon: React.ReactNode;
  slots: DockSlot[];
  now: Date;
}) {
  return (
    <div className="rt-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon}
          {title}
        </div>
        <span className="text-xs text-muted-foreground">{slots.length}</span>
      </div>
      {slots.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Нет окон</div>
      ) : (
        <div className="space-y-2">
          {slots.map((s) => (
            <SlotCard key={s.id} slot={s} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

function SlotCard({ slot, now }: { slot: DockSlot; now: Date }) {
  const qc = useQueryClient();
  const e = eta(slot.expected_arrival_at, now);

  const setStatus = useMutation({
    mutationFn: async (next: DockSlotStatus) => {
      const patch: Record<string, unknown> = { status: next };
      if (next === "arrived" && !slot.arrived_at) patch.arrived_at = new Date().toISOString();
      if (next === "loaded" || next === "done") {
        patch.confirmed_at = new Date().toISOString();
      }
      const { error } = await db
        .from("warehouse_dock_slots")
        .update(patch)
        .eq("id", slot.id);
      if (error) throw error;
    },
    onSuccess: (_v, next) => {
      qc.invalidateQueries({ queryKey: ["dock_slots", slot.warehouse_id] });
      toast.success(`Статус: ${DOCK_SLOT_STATUS_LABELS[next as DockSlotStatus]}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("warehouse_dock_slots").delete().eq("id", slot.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dock_slots", slot.warehouse_id] });
      toast.success("Окно удалено");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const showArrive = slot.status === "planned";
  const showLoad = slot.status === "arrived" || slot.status === "loading";
  const showDone =
    slot.status === "loaded" ||
    (slot.slot_kind !== "shipment" && (slot.status === "arrived" || slot.status === "loading"));

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-foreground">
            {shortTime(slot.start_time)}
            {slot.end_time && (
              <span className="text-muted-foreground"> – {shortTime(slot.end_time)}</span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            {DOCK_SLOT_KIND_SHORT[slot.slot_kind]}
          </div>
        </div>
        <span className={`badge-status ${DOCK_SLOT_STATUS_BADGE[slot.status]}`}>
          {DOCK_SLOT_STATUS_LABELS[slot.status]}
        </span>
      </div>

      {/* Карточка машины */}
      <div className="mt-2 space-y-0.5 text-xs text-foreground">
        {slot.driver_name && (
          <div className="inline-flex items-center gap-1">
            <User className="h-3 w-3 text-muted-foreground" />
            {slot.driver_name}
          </div>
        )}
        {slot.vehicle_plate && (
          <div className="inline-flex items-center gap-1">
            <Truck className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono">{slot.vehicle_plate}</span>
            {slot.carrier_name && <span className="text-muted-foreground">· {slot.carrier_name}</span>}
          </div>
        )}
        {slot.cargo_summary && (
          <div className="text-muted-foreground">{slot.cargo_summary}</div>
        )}
        {slot.notes && <div className="italic text-muted-foreground">{slot.notes}</div>}
      </div>

      {/* Таймер прибытия */}
      {slot.expected_arrival_at && slot.status === "planned" && (
        <div
          className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${
            e.late ? "text-status-danger" : "text-status-warning"
          }`}
        >
          <Clock className="h-3 w-3" />
          {e.label}
        </div>
      )}

      {/* Действия */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {showArrive && (
          <Button size="sm" variant="outline" onClick={() => setStatus.mutate("arrived")}>
            Машина прибыла
          </Button>
        )}
        {showLoad && slot.slot_kind === "shipment" && (
          <Button size="sm" onClick={() => setStatus.mutate("loaded")} className="gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Загрузка завершена
          </Button>
        )}
        {showDone && slot.slot_kind !== "shipment" && (
          <Button size="sm" onClick={() => setStatus.mutate("done")} className="gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Принято
          </Button>
        )}
        {slot.status === "loaded" && slot.slot_kind === "shipment" && (
          <Button size="sm" variant="outline" onClick={() => setStatus.mutate("done")}>
            Машина уехала
          </Button>
        )}
        {slot.status !== "cancelled" && slot.status !== "done" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setStatus.mutate("cancelled")}
            className="text-status-danger"
          >
            Отменить
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (confirm("Удалить окно?")) remove.mutate();
          }}
          className="ml-auto text-muted-foreground"
          aria-label="Удалить"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ===================== Новое окно =====================

function NewSlotButton({ warehouseId, date }: { warehouseId: string; date: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DockSlotKind>("shipment");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("");
  const [driverName, setDriverName] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [cargoSummary, setCargoSummary] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setKind("shipment");
    setStartTime("09:00");
    setEndTime("");
    setDriverName("");
    setVehiclePlate("");
    setCarrierName("");
    setCargoSummary("");
    setExpectedAt("");
    setNotes("");
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!startTime) throw new Error("Укажите время начала");
      const payload = {
        warehouse_id: warehouseId,
        slot_kind: kind,
        slot_date: date,
        start_time: startTime,
        end_time: endTime || null,
        driver_name: driverName.trim() || null,
        vehicle_plate: vehiclePlate.trim() || null,
        carrier_name: carrierName.trim() || null,
        cargo_summary: cargoSummary.trim() || null,
        expected_arrival_at: expectedAt ? new Date(expectedAt).toISOString() : null,
        notes: notes.trim() || null,
      };
      const { error } = await db.from("warehouse_dock_slots").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dock_slots", warehouseId] });
      toast.success("Окно создано");
      setOpen(false);
      reset();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Добавить окно
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Новое окно</DialogTitle>
            <DialogDescription>Загрузка маршрута, приёмка с завода или возврата</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label>Тип</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as DockSlotKind)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(DOCK_SLOT_KIND_LABELS) as DockSlotKind[]).map((k) => (
                    <SelectItem key={k} value={k}>{DOCK_SLOT_KIND_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Время начала *</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label>Время окончания</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1.5" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Водитель</Label>
                <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} className="mt-1.5" placeholder="Иванов И.И." />
              </div>
              <div>
                <Label>Госномер</Label>
                <Input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} className="mt-1.5" placeholder="A123BC777" />
              </div>
            </div>
            <div>
              <Label>Перевозчик</Label>
              <Input value={carrierName} onChange={(e) => setCarrierName(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Что везём (краткое)</Label>
              <Input value={cargoSummary} onChange={(e) => setCargoSummary(e.target.value)} className="mt-1.5" placeholder="3 паллеты, 850 кг" />
            </div>
            <div>
              <Label>Ожидаемое прибытие</Label>
              <Input type="datetime-local" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Заметки</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1.5" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? "Сохранение…" : "Создать"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ===================== Сотрудники =====================

type StaffFormState = {
  full_name: string;
  phone: string;
  email: string;
  role: WarehouseStaffRole;
  comment: string;
};

const EMPTY_STAFF_FORM: StaffFormState = {
  full_name: "",
  phone: "",
  email: "",
  role: "storekeeper",
  comment: "",
};

function StaffSection({ warehouseId, staff }: { warehouseId: string; staff: WarehouseStaff[] }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseStaff | null>(null);
  const [form, setForm] = useState<StaffFormState>(EMPTY_STAFF_FORM);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["warehouse_staff", warehouseId] });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_STAFF_FORM);
    setDialogOpen(true);
  };

  const openEdit = (s: WarehouseStaff) => {
    setEditing(s);
    setForm({
      full_name: s.full_name,
      phone: s.phone ?? "",
      email: s.email ?? "",
      role: s.role,
      comment: s.comment ?? "",
    });
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim()) throw new Error("Укажите ФИО");
      const payload = {
        warehouse_id: warehouseId,
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        role: form.role,
        comment: form.comment.trim() || null,
      };
      if (editing) {
        const { error } = await db
          .from("warehouse_staff")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("warehouse_staff").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success(editing ? "Сотрудник обновлён" : "Сотрудник добавлен");
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_STAFF_FORM);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (s: WarehouseStaff) => {
      const { error } = await db
        .from("warehouse_staff")
        .update({ is_active: !s.is_active })
        .eq("id", s.id);
      if (error) throw error;
      return !s.is_active;
    },
    onSuccess: (nowActive) => {
      invalidate();
      toast.success(nowActive ? "Сотрудник активирован" : "Сотрудник деактивирован");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("warehouse_staff").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Удалено");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const active = staff.filter((s) => s.is_active);
  const inactive = staff.filter((s) => !s.is_active);
  const managers = active.filter((s) => s.role === "manager");
  const storekeepers = active.filter((s) => s.role === "storekeeper");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {active.length} активных{inactive.length > 0 ? ` · ${inactive.length} в архиве` : ""}
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Добавить
        </Button>
      </div>

      {active.length === 0 && inactive.length === 0 && (
        <div className="rt-card p-8 text-center text-sm text-muted-foreground">
          Нет сотрудников. Добавьте начальника склада и кладовщиков.
        </div>
      )}

      <StaffGroup
        title="Начальники склада"
        people={managers}
        onEdit={openEdit}
        onToggleActive={(s) => toggleActive.mutate(s)}
        onRemove={(id) => remove.mutate(id)}
      />
      <StaffGroup
        title="Кладовщики"
        people={storekeepers}
        onEdit={openEdit}
        onToggleActive={(s) => toggleActive.mutate(s)}
        onRemove={(id) => remove.mutate(id)}
      />
      {inactive.length > 0 && (
        <StaffGroup
          title="Архив (деактивированные)"
          people={inactive}
          muted
          onEdit={openEdit}
          onToggleActive={(s) => toggleActive.mutate(s)}
          onRemove={(id) => remove.mutate(id)}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать сотрудника" : "Новый сотрудник"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Измените данные сотрудника склада"
                : "Назначьте начальника склада или кладовщика"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label>ФИО *</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Телефон</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="mt-1.5"
                  placeholder="+7…"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label>Роль</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as WarehouseStaffRole }))}
              >
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">{STAFF_ROLE_LABELS.manager}</SelectItem>
                  <SelectItem value="storekeeper">{STAFF_ROLE_LABELS.storekeeper}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Комментарий</Label>
              <Textarea
                value={form.comment}
                onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                rows={2}
                className="mt-1.5"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Сохранение…" : editing ? "Сохранить" : "Добавить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StaffGroup({
  title,
  people,
  muted = false,
  onEdit,
  onToggleActive,
  onRemove,
}: {
  title: string;
  people: WarehouseStaff[];
  muted?: boolean;
  onEdit: (s: WarehouseStaff) => void;
  onToggleActive: (s: WarehouseStaff) => void;
  onRemove: (id: string) => void;
}) {
  if (people.length === 0) return null;
  return (
    <div className="rt-card p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {people.map((p) => (
          <div
            key={p.id}
            className={`flex items-start justify-between gap-2 rounded-md border border-border bg-background p-2.5 ${
              muted ? "opacity-60" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">
                {p.full_name}
                {!p.is_active && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
                    архив
                  </span>
                )}
              </div>
              {p.phone && <div className="text-xs text-muted-foreground">{p.phone}</div>}
              {p.email && <div className="truncate text-xs text-muted-foreground">{p.email}</div>}
              {p.comment && (
                <div className="mt-1 text-xs italic text-muted-foreground">{p.comment}</div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(p)}
                aria-label="Редактировать"
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleActive(p)}
                aria-label={p.is_active ? "Деактивировать" : "Активировать"}
                className="text-muted-foreground hover:text-foreground"
              >
                {p.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm(`Удалить ${p.full_name}? Это действие необратимо.`)) onRemove(p.id);
                }}
                aria-label="Удалить"
                className="text-muted-foreground hover:text-status-danger"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===================== Настройки склада =====================

function SettingsSection({ warehouse }: { warehouse: WarehouseFull }) {
  const qc = useQueryClient();
  const [hours, setHours] = useState<WorkingHours>(warehouse.working_hours ?? DEFAULT_WORKING_HOURS);
  const [breaks, setBreaks] = useState<Break[]>(warehouse.breaks ?? DEFAULT_BREAKS);
  const [managerName, setManagerName] = useState(warehouse.manager_name ?? "");
  const [managerPhone, setManagerPhone] = useState(warehouse.manager_phone ?? "");
  const [zone, setZone] = useState(warehouse.delivery_zone ?? "");
  const [radius, setRadius] = useState<string>(
    warehouse.delivery_radius_km?.toString() ?? "",
  );
  const [lat, setLat] = useState<string>(warehouse.latitude?.toString() ?? "");
  const [lng, setLng] = useState<string>(warehouse.longitude?.toString() ?? "");
  const [notes, setNotes] = useState(warehouse.notes ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        working_hours: hours,
        breaks,
        manager_name: managerName.trim() || null,
        manager_phone: managerPhone.trim() || null,
        delivery_zone: zone.trim() || null,
        delivery_radius_km: radius ? Number(radius) : null,
        latitude: lat ? Number(lat) : null,
        longitude: lng ? Number(lng) : null,
        notes: notes.trim() || null,
      };
      const { error } = await db.from("warehouses").update(payload).eq("id", warehouse.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouse", warehouse.id] });
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Настройки сохранены");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setDay = (
    day: keyof WorkingHours,
    patch: Partial<WorkingHours[keyof WorkingHours]>,
  ) => {
    setHours((h) => ({ ...h, [day]: { ...h[day], ...patch } }));
  };

  return (
    <div className="space-y-6">
      {/* Часы работы */}
      <div className="rt-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Часы работы</h3>
        <div className="space-y-2">
          {WEEK_DAYS.map((d) => (
            <div key={d} className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background p-2.5">
              <div className="w-32 text-sm font-medium text-foreground">{WEEK_DAY_LABELS_FULL[d]}</div>
              <Switch checked={hours[d].enabled} onCheckedChange={(v) => setDay(d, { enabled: v })} />
              <Input
                type="time"
                value={hours[d].open}
                onChange={(e) => setDay(d, { open: e.target.value })}
                disabled={!hours[d].enabled}
                className="w-28"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="time"
                value={hours[d].close}
                onChange={(e) => setDay(d, { close: e.target.value })}
                disabled={!hours[d].enabled}
                className="w-28"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Перерывы */}
      <div className="rt-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Перерывы / обед</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBreaks((b) => [...b, { label: "Перерыв", start: "13:00", end: "13:30" }])}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Добавить
          </Button>
        </div>
        {breaks.length === 0 ? (
          <div className="text-sm text-muted-foreground">Перерывов нет</div>
        ) : (
          <div className="space-y-2">
            {breaks.map((b, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-2">
                <Input
                  value={b.label}
                  onChange={(e) =>
                    setBreaks((arr) => arr.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                  }
                  className="max-w-[12rem]"
                />
                <Input
                  type="time"
                  value={b.start}
                  onChange={(e) =>
                    setBreaks((arr) => arr.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))
                  }
                  className="w-28"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="time"
                  value={b.end}
                  onChange={(e) =>
                    setBreaks((arr) => arr.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))
                  }
                  className="w-28"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setBreaks((arr) => arr.filter((_, j) => j !== i))}
                  className="ml-auto text-muted-foreground hover:text-status-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Зона доставки + начальник + координаты */}
      <div className="rt-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Зона, начальник, координаты</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Зона доставки</Label>
            <Input value={zone} onChange={(e) => setZone(e.target.value)} className="mt-1.5" placeholder="Краснодарский край" />
          </div>
          <div>
            <Label>Радиус доставки, км</Label>
            <Input type="number" inputMode="decimal" value={radius} onChange={(e) => setRadius(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label>Начальник склада</Label>
            <Input value={managerName} onChange={(e) => setManagerName(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label>Телефон начальника</Label>
            <Input value={managerPhone} onChange={(e) => setManagerPhone(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label>Широта</Label>
            <Input type="number" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} className="mt-1.5" placeholder="45.0355" />
          </div>
          <div>
            <Label>Долгота</Label>
            <Input type="number" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} className="mt-1.5" placeholder="38.9753" />
          </div>
          <div className="sm:col-span-2">
            <Label>Заметки по складу</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1.5" />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
          <Save className="h-4 w-4" />
          {save.isPending ? "Сохранение…" : "Сохранить настройки"}
        </Button>
      </div>
    </div>
  );
}

// Memo helper unused но оставлен на случай будущих расчётов времени
function _unused() {
  return useMemo(() => 0, []);
}
