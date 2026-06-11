import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { freightsApi, type FreeVehicleRow } from "@/lib/dispatcher/api";

const SOURCE_OPTIONS = [
  { v: "ati", l: "ATI" },
  { v: "manual", l: "Вручную" },
  { v: "group", l: "Группа/чат" },
  { v: "site", l: "Сайт" },
  { v: "other", l: "Другое" },
];

const PAYMENT_OPTIONS = [
  { v: "", l: "—" },
  { v: "cash", l: "Нал" },
  { v: "cashless_vat", l: "Безнал с НДС" },
  { v: "cashless_no_vat", l: "Безнал без НДС" },
  { v: "card", l: "Карта" },
  { v: "combined", l: "Смешанная" },
];

export function AddFoundFreightDialog({
  vehicle,
  open,
  onOpenChange,
}: {
  vehicle: FreeVehicleRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [showAdv, setShowAdv] = useState(false);
  const [f, setF] = useState({
    source_type: "ati",
    source_url: "",
    loading_city: "",
    unloading_city: "",
    loading_date: "",
    unloading_date: "",
    cargo_name: "",
    weight_kg: "",
    volume_m3: "",
    body_type: "",
    rate: "",
    payment_type: "",
    payment_delay_days: "",
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    comment: "",
  });

  const set = <K extends keyof typeof f>(k: K, v: string) =>
    setF((p) => ({ ...p, [k]: v }));

  const reset = () => {
    setF({
      source_type: "ati",
      source_url: "",
      loading_city: "",
      unloading_city: "",
      loading_date: "",
      unloading_date: "",
      cargo_name: "",
      weight_kg: "",
      volume_m3: "",
      body_type: "",
      rate: "",
      payment_type: "",
      payment_delay_days: "",
      customer_name: "",
      customer_phone: "",
      customer_email: "",
      comment: "",
    });
    setShowAdv(false);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!vehicle) throw new Error("Нет машины");
      if (!vehicle.carrier?.id) throw new Error("Транспорт не привязан к перевозчику");
      const payload = {
        title:
          [f.loading_city, f.unloading_city].filter(Boolean).join(" → ") ||
          f.cargo_name ||
          "Найденный груз",
        loading_city: f.loading_city || null,
        unloading_city: f.unloading_city || null,
        loading_date: f.loading_date || null,
        unloading_date: f.unloading_date || null,
        cargo_name: f.cargo_name || null,
        weight_kg: f.weight_kg ? Number(f.weight_kg) : null,
        volume_m3: f.volume_m3 ? Number(f.volume_m3) : null,
        body_type: f.body_type || null,
        rate: f.rate ? Number(f.rate) : null,
        payment_type: f.payment_type && f.payment_type !== "_" ? f.payment_type : null,
        payment_delay_days: f.payment_delay_days ? Number(f.payment_delay_days) : null,
        source: f.source_type,
        source_type: f.source_type,
        source_url: f.source_url || null,
        customer_name: f.customer_name || null,
        customer_phone: f.customer_phone || null,
        customer_email: f.customer_email || null,
        contact_name: f.customer_name || null,
        contact_phone: f.customer_phone || null,
        comment: f.comment || null,
        dispatcher_status: "checking" as const,
        assigned_vehicle_ext_id: vehicle.id,
        assigned_carrier_ext_id: vehicle.carrier.id,
        assigned_driver_ext_id: vehicle.driver?.id ?? null,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return freightsApi.create(payload as any);
    },
    onSuccess: () => {
      toast.success("Груз добавлен под машину");
      if (vehicle && !vehicle.driver?.id) {
        toast.warning("Машина без водителя — назначьте водителя перед предложением");
      }
      qc.invalidateQueries({ queryKey: ["vehicle-freights", vehicle?.id] });
      qc.invalidateQueries({ queryKey: ["free-vehicles"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    },
  });

  if (!vehicle) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Добавить найденный груз</DialogTitle>
          <DialogDescription>
            Под машину {vehicle.vehicle_kind ?? "—"}
            {vehicle.body_type ? ` · ${vehicle.body_type}` : ""}
            {" · "}
            {vehicle.carrier?.name ?? "перевозчик не указан"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Источник">
            <Select value={f.source_type} onValueChange={(v) => set("source_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((o) => (
                  <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Ссылка на источник">
            <Input value={f.source_url} onChange={(e) => set("source_url", e.target.value)} />
          </Field>
          <Field label="Город загрузки">
            <Input value={f.loading_city} onChange={(e) => set("loading_city", e.target.value)} />
          </Field>
          <Field label="Город выгрузки">
            <Input value={f.unloading_city} onChange={(e) => set("unloading_city", e.target.value)} />
          </Field>
          <Field label="Дата загрузки">
            <Input type="date" value={f.loading_date} onChange={(e) => set("loading_date", e.target.value)} />
          </Field>
          <Field label="Дата выгрузки">
            <Input type="date" value={f.unloading_date} onChange={(e) => set("unloading_date", e.target.value)} />
          </Field>
          <Field label="Груз" full>
            <Input value={f.cargo_name} onChange={(e) => set("cargo_name", e.target.value)} />
          </Field>
          <Field label="Вес, кг">
            <Input type="number" value={f.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} />
          </Field>
          <Field label="Объём, м³">
            <Input type="number" value={f.volume_m3} onChange={(e) => set("volume_m3", e.target.value)} />
          </Field>
          <Field label="Кузов">
            <Input value={f.body_type} onChange={(e) => set("body_type", e.target.value)} />
          </Field>
          <Field label="Ставка, ₽">
            <Input type="number" value={f.rate} onChange={(e) => set("rate", e.target.value)} />
          </Field>
        </div>

        <Button variant="ghost" size="sm" onClick={() => setShowAdv((p) => !p)} className="justify-start">
          {showAdv ? "Скрыть дополнительные поля" : "Дополнительно…"}
        </Button>

        {showAdv && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Оплата">
              <Select value={f.payment_type} onValueChange={(v) => set("payment_type", v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_OPTIONS.map((o) => (
                    <SelectItem key={o.v || "_"} value={o.v || "_"}>{o.l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Отсрочка, дней">
              <Input type="number" value={f.payment_delay_days} onChange={(e) => set("payment_delay_days", e.target.value)} />
            </Field>
            <Field label="Контакт заказчика">
              <Input value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)} />
            </Field>
            <Field label="Телефон заказчика">
              <Input value={f.customer_phone} onChange={(e) => set("customer_phone", e.target.value)} />
            </Field>
            <Field label="Email заказчика" full>
              <Input value={f.customer_email} onChange={(e) => set("customer_email", e.target.value)} />
            </Field>
            <Field label="Комментарий диспетчера" full>
              <Textarea
                rows={3}
                value={f.comment}
                onChange={(e) => set("comment", e.target.value)}
              />
            </Field>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
          >
            {createMut.isPending ? "Создаём…" : "Создать груз"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
