import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import {
  enqueue as enqueueOp,
  registerHandler,
  subscribe as subscribeQueue,
  subscribeFailure,
  dismissLastFailure,
  type QueueOp,
  type QueueFailure,
} from "@/lib/offline-queue";
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
  Search,
  Mail,
  AlertTriangle,
  X,
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

  // Realtime — сотрудники склада обновляются автоматически (актуальность подсказок)
  useEffect(() => {
    const channel = supabase
      .channel(`warehouse-staff-${warehouseId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "warehouse_staff",
          filter: `warehouse_id=eq.${warehouseId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["warehouse_staff", warehouseId] });
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

  // Регистрируем обработчики офлайн-очереди один раз для warehouse_staff.
  // Они выполняются при возврате сети либо по таймеру повторов.
  useEffect(() => {
    registerHandler("staff.save.create", async (payload) => {
      const p = payload as Record<string, unknown>;
      const { error } = await db.from("warehouse_staff").insert(p);
      if (error) throw error;
      invalidate();
    });
    registerHandler("staff.save.update", async (payload) => {
      const { id, ...rest } = payload as { id: string } & Record<string, unknown>;
      const { error } = await db.from("warehouse_staff").update(rest).eq("id", id);
      if (error) throw error;
      invalidate();
    });
    registerHandler("staff.toggle", async (payload) => {
      const { id, is_active } = payload as { id: string; is_active: boolean };
      const { error } = await db
        .from("warehouse_staff")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
      invalidate();
    });
    registerHandler("staff.remove", async (payload) => {
      const { id } = payload as { id: string };
      const { error } = await db.from("warehouse_staff").delete().eq("id", id);
      if (error) throw error;
      invalidate();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId]);

  // Фильтр области ошибок/очереди: текущий склад или все склады.
  // Сохраняется в localStorage, чтобы выбор пользователя помнился между сессиями.
  const [errorScope, setErrorScope] = useState<"current" | "all">(() => {
    if (typeof window === "undefined") return "current";
    const v = window.localStorage.getItem("warehouse.errorScope");
    return v === "all" ? "all" : "current";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("warehouse.errorScope", errorScope);
    }
  }, [errorScope]);

  const matchesScope = (op: { kind: string; payload: unknown }) => {
    if (!op.kind.startsWith("staff.")) return false;
    if (errorScope === "all") return true;
    const p = op.payload as { warehouse_id?: string } | null | undefined;
    return p?.warehouse_id === warehouseId;
  };

  // Подписка на состояние очереди — для индикатора и оптимистичных обновлений UI
  const [queueItems, setQueueItems] = useState<QueueOp[]>([]);
  useEffect(() => {
    return subscribeQueue(setQueueItems);
  }, []);
  const pendingStaffOps = useMemo(
    () => queueItems.filter(matchesScope),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queueItems, errorScope, warehouseId]
  );

  // Последняя ошибка повтора (обновляется при каждой неудаче)
  const [lastFailure, setLastFailureState] = useState<QueueFailure | null>(null);
  useEffect(() => {
    return subscribeFailure(setLastFailureState);
  }, []);
  // Применяем выбранный фильтр области
  const staffFailure =
    lastFailure && matchesScope({ kind: lastFailure.kind, payload: lastFailure.payload })
      ? lastFailure
      : null;

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
        enqueueOp(
          "staff.save.update",
          { id: editing.id, ...payload },
          `Изменение: ${payload.full_name}`
        );
      } else {
        enqueueOp("staff.save.create", payload, `Добавление: ${payload.full_name}`);
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Изменения поставлены в очередь" : "Сотрудник поставлен в очередь");
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_STAFF_FORM);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (s: WarehouseStaff) => {
      enqueueOp(
        "staff.toggle",
        { id: s.id, is_active: !s.is_active, warehouse_id: warehouseId },
        `${s.is_active ? "Деактивация" : "Активация"}: ${s.full_name}`
      );
      return !s.is_active;
    },
    onSuccess: (nowActive) => {
      toast.success(nowActive ? "Активация в очереди" : "Деактивация в очереди");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      enqueueOp(
        "staff.remove",
        { id, warehouse_id: warehouseId },
        `Удаление сотрудника`
      );
    },
    onSuccess: () => {
      toast.success("Удаление поставлено в очередь");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | WarehouseStaffRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Сбрасываем активный индекс при смене подсказок
  useEffect(() => {
    setActiveIdx(0);
  }, [search, staff.length]);

  const pickSuggestion = (value: string) => {
    setSearch(value);
    setSuggestOpen(false);
    searchInputRef.current?.blur();
  };

  // Подсказки автодополнения: уникальные ФИО / телефоны / email,
  // отфильтрованные по текущему вводу. Уважают role/status фильтры.
  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as Array<{ value: string; field: "name" | "phone" | "email"; person: WarehouseStaff }>;
    const seen = new Set<string>();
    const out: Array<{ value: string; field: "name" | "phone" | "email"; person: WarehouseStaff }> = [];
    for (const s of staff) {
      if (statusFilter === "active" && !s.is_active) continue;
      if (statusFilter === "inactive" && s.is_active) continue;
      if (roleFilter !== "all" && s.role !== roleFilter) continue;
      const candidates: Array<{ value: string; field: "name" | "phone" | "email" }> = [
        { value: s.full_name, field: "name" },
        ...(s.phone ? [{ value: s.phone, field: "phone" as const }] : []),
        ...(s.email ? [{ value: s.email, field: "email" as const }] : []),
      ];
      for (const c of candidates) {
        if (!c.value.toLowerCase().includes(q)) continue;
        const key = `${c.field}:${c.value.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...c, person: s });
        if (out.length >= 8) return out;
      }
    }
    return out;
  }, [search, staff, statusFilter, roleFilter]);


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      if (statusFilter === "active" && !s.is_active) return false;
      if (statusFilter === "inactive" && s.is_active) return false;
      if (roleFilter !== "all" && s.role !== roleFilter) return false;
      if (q) {
        const hay = [s.full_name, s.phone ?? "", s.email ?? "", s.comment ?? ""]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [staff, search, roleFilter, statusFilter]);

  const totalActive = staff.filter((s) => s.is_active).length;
  const totalInactive = staff.length - totalActive;
  const managers = filtered.filter((s) => s.role === "manager" && s.is_active);
  const storekeepers = filtered.filter((s) => s.role === "storekeeper" && s.is_active);
  const inactiveFiltered = filtered.filter((s) => !s.is_active);
  const hasFilters = search.trim() !== "" || roleFilter !== "all" || statusFilter !== "active";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {totalActive} активных{totalInactive > 0 ? ` · ${totalInactive} в архиве` : ""}
          {pendingStaffOps.length > 0 && (
            <span
              className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
              title={pendingStaffOps.map((p) => p.label ?? p.kind).join("\n")}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              В очереди: {pendingStaffOps.length}
            </span>
          )}
          {staffFailure && (
            <span
              className="ml-1 inline-flex max-w-[20rem] items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
              title={`${staffFailure.label ?? staffFailure.kind}\nПопытка #${staffFailure.attempts}${
                staffFailure.dropped ? " (отменено)" : ""
              }\n${new Date(staffFailure.at).toLocaleTimeString()}\n${staffFailure.message}`}
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {staffFailure.dropped ? "Отменено: " : "Ошибка: "}
                {staffFailure.message}
              </span>
              <button
                type="button"
                onClick={() => dismissLastFailure()}
                className="ml-0.5 rounded p-0.5 hover:bg-destructive/20"
                aria-label="Скрыть ошибку"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div
            className="inline-flex items-center rounded-md border border-border bg-background p-0.5 text-xs"
            role="group"
            aria-label="Область ошибок и очереди"
            title="Показывать события очереди только этого склада или всех"
          >
            <button
              type="button"
              onClick={() => setErrorScope("current")}
              className={`rounded px-2 py-1 transition-colors ${
                errorScope === "current"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Этот склад
            </button>
            <button
              type="button"
              onClick={() => setErrorScope("all")}
              className={`rounded px-2 py-1 transition-colors ${
                errorScope === "all"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Все склады
            </button>
          </div>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Добавить
          </Button>
        </div>
      </div>

      {/* Поиск и фильтры */}
      <div className="rt-card flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSuggestOpen(false);
                searchInputRef.current?.blur();
                return;
              }
              if (!suggestOpen || suggestions.length === 0) {
                if (e.key === "Enter") {
                  setSuggestOpen(false);
                  searchInputRef.current?.blur();
                }
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIdx((i) => (i + 1) % suggestions.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
              } else if (e.key === "Enter") {
                e.preventDefault();
                const sug = suggestions[activeIdx] ?? suggestions[0];
                if (sug) pickSuggestion(sug.value);
              }
            }}
            placeholder="Поиск по ФИО, телефону, email…"
            className="pl-8"
            aria-autocomplete="list"
            aria-expanded={suggestOpen && suggestions.length > 0}
          />
          {suggestOpen && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-md">
              {suggestions.map((sug, i) => (
                <button
                  key={`${sug.field}-${sug.value}-${i}`}
                  type="button"
                  onMouseEnter={() => setActiveIdx(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickSuggestion(sug.value);
                  }}
                  className={`flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm ${
                    i === activeIdx ? "bg-accent" : "hover:bg-accent"
                  }`}
                >
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
                    {sug.field === "name" ? (
                      <User className="h-3.5 w-3.5" />
                    ) : sug.field === "phone" ? (
                      <Phone className="h-3.5 w-3.5" />
                    ) : (
                      <Mail className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-foreground">
                      <HighlightMatch text={sug.value} query={search} />
                    </span>
                    {sug.field !== "name" && (
                      <span className="block truncate text-xs text-muted-foreground">
                        <HighlightMatch text={sug.person.full_name} query={search} />
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {sug.field === "name" ? "ФИО" : sug.field === "phone" ? "тел" : "email"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
          <SelectTrigger className="w-[12rem]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все роли</SelectItem>
            <SelectItem value="manager">{STAFF_ROLE_LABELS.manager}</SelectItem>
            <SelectItem value="storekeeper">{STAFF_ROLE_LABELS.storekeeper}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[10rem]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Активные</SelectItem>
            <SelectItem value="inactive">В архиве</SelectItem>
            <SelectItem value="all">Все</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setRoleFilter("all");
              setStatusFilter("active");
            }}
          >
            Сбросить
          </Button>
        )}
      </div>

      {staff.length === 0 ? (
        <div className="rt-card p-8 text-center text-sm text-muted-foreground">
          Нет сотрудников. Добавьте начальника склада и кладовщиков.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rt-card p-8 text-center text-sm text-muted-foreground">
          Никого не найдено по заданным фильтрам.
        </div>
      ) : (
        <>
          <StaffGroup
            title="Начальники склада"
            people={managers}
            highlight={search}
            onEdit={openEdit}
            onToggleActive={(s) => toggleActive.mutate(s)}
            onRemove={(id) => remove.mutate(id)}
          />
          <StaffGroup
            title="Кладовщики"
            people={storekeepers}
            highlight={search}
            onEdit={openEdit}
            onToggleActive={(s) => toggleActive.mutate(s)}
            onRemove={(id) => remove.mutate(id)}
          />
          {inactiveFiltered.length > 0 && (
            <StaffGroup
              title="Архив (деактивированные)"
              people={inactiveFiltered}
              muted
              highlight={search}
              onEdit={openEdit}
              onToggleActive={(s) => toggleActive.mutate(s)}
              onRemove={(id) => remove.mutate(id)}
            />
          )}
        </>
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
  highlight = "",
  onEdit,
  onToggleActive,
  onRemove,
}: {
  title: string;
  people: WarehouseStaff[];
  muted?: boolean;
  highlight?: string;
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
                <HighlightMatch text={p.full_name} query={highlight} />
                {!p.is_active && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
                    архив
                  </span>
                )}
              </div>
              {p.phone && (
                <div className="text-xs text-muted-foreground">
                  <HighlightMatch text={p.phone} query={highlight} />
                </div>
              )}
              {p.email && (
                <div className="truncate text-xs text-muted-foreground">
                  <HighlightMatch text={p.email} query={highlight} />
                </div>
              )}
              {p.comment && (
                <div className="mt-1 text-xs italic text-muted-foreground">
                  <HighlightMatch text={p.comment} query={highlight} />
                </div>
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

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: Array<{ s: string; hit: boolean }> = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(needle, i);
    if (idx === -1) {
      parts.push({ s: text.slice(i), hit: false });
      break;
    }
    if (idx > i) parts.push({ s: text.slice(i, idx), hit: false });
    parts.push({ s: text.slice(idx, idx + needle.length), hit: true });
    i = idx + needle.length;
  }
  return (
    <>
      {parts.map((p, k) =>
        p.hit ? (
          <mark key={k} className="rounded bg-primary/30 px-0.5 text-foreground">
            {p.s}
          </mark>
        ) : (
          <span key={k}>{p.s}</span>
        ),
      )}
    </>
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
