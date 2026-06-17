import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Loader2 } from "lucide-react";
import { apiPost, apiPatch } from "@/lib/api-client";
import { CityCombobox } from "@/components/common/CityCombobox";
import {
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABELS,
  LOAD_METHODS,
  LOAD_METHOD_LABELS,
  VEHICLE_FEATURES,
  VEHICLE_FEATURE_LABELS,
  type VehicleStatus,
  type LoadMethod,
  type VehicleFeature,
} from "@/lib/dispatcher/statuses";
import { kgToTonsInput, tonsInputToKg } from "@/lib/units";

export interface CarrierVehicle {
  id: string;
  vehicle_kind: string | null;
  body_type: string | null;
  payload_kg: number | null;
  volume_m3: number | null;
  length_m: number | null;
  width_m: number | null;
  height_m: number | null;
  load_methods: string[] | null;
  body_features?: string[] | null;
  home_city: string | null;
  ready_date: string | null;
  dispatcher_status: string;
  dispatcher_comment: string | null;
  dispatcher_driver_ext_id: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: CarrierVehicle | null;
  drivers?: Array<{ id: string; full_name: string | null }>;
  onSaved: () => void;
}

const EMPTY = {
  vehicle_kind: "",
  body_type: "",
  payload_kg: "",
  volume_m3: "",
  length_m: "",
  width_m: "",
  height_m: "",
  load_methods: [] as LoadMethod[],
  body_features: [] as VehicleFeature[],
  home_city: "",
  ready_date: "",
  dispatcher_status: "new" as VehicleStatus,
  dispatcher_comment: "",
  dispatcher_driver_ext_id: "",
};

export function CarrierVehicleForm({ open, onOpenChange, initial, drivers = [], onSaved }: Props) {
  const [values, setValues] = useState(() =>
    initial
      ? {
          vehicle_kind: initial.vehicle_kind ?? "",
          body_type: initial.body_type ?? "",
          payload_kg: kgToTonsInput(initial.payload_kg),
          volume_m3: initial.volume_m3?.toString() ?? "",
          length_m: initial.length_m?.toString() ?? "",
          width_m: initial.width_m?.toString() ?? "",
          height_m: initial.height_m?.toString() ?? "",
          load_methods: (initial.load_methods ?? []) as LoadMethod[],
          body_features: (initial.body_features ?? []) as VehicleFeature[],
          home_city: initial.home_city ?? "",
          ready_date: initial.ready_date ?? "",
          dispatcher_status: (initial.dispatcher_status ?? "new") as VehicleStatus,
          dispatcher_comment: initial.dispatcher_comment ?? "",
          dispatcher_driver_ext_id: initial.dispatcher_driver_ext_id ?? "",
        }
      : EMPTY,
  );
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof values>(k: K, v: (typeof values)[K]) =>
    setValues((p) => ({ ...p, [k]: v }));

  const toggleLoadMethod = (m: LoadMethod) =>
    setValues((p) => ({
      ...p,
      load_methods: p.load_methods.includes(m)
        ? p.load_methods.filter((x) => x !== m)
        : [...p.load_methods, m],
    }));

  const toggleBodyFeature = (f: VehicleFeature) =>
    setValues((p) => ({
      ...p,
      body_features: p.body_features.includes(f)
        ? p.body_features.filter((x) => x !== f)
        : [...p.body_features, f],
    }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!values.vehicle_kind.trim()) {
      toast.error("Укажите марку/модель/госномер");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        vehicle_kind: values.vehicle_kind || null,
        body_type: values.body_type || null,
        payload_kg: tonsInputToKg(values.payload_kg),
        volume_m3: values.volume_m3 || null,
        length_m: values.length_m || null,
        width_m: values.width_m || null,
        height_m: values.height_m || null,
        load_methods: values.load_methods.length ? values.load_methods : null,
        body_features: values.body_features.length ? values.body_features : null,
        home_city: values.home_city || null,
        ready_date: values.ready_date || null,
        dispatcher_status: values.dispatcher_status,
        dispatcher_comment: values.dispatcher_comment || null,
        dispatcher_driver_ext_id: values.dispatcher_driver_ext_id || null,
      };
      if (initial) {
        await apiPatch(`/api/carrier/vehicles/${initial.id}`, payload, 15000);
        toast.success("Транспорт обновлён");
      } else {
        await apiPost("/api/carrier/vehicles", payload, 15000);
        toast.success("Транспорт добавлен");
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Редактирование транспорта" : "Новый транспорт"}</DialogTitle>
          <DialogDescription>
            Заполните данные транспорта. Город готовности — обычное поле (подсказки Яндекс
            подключим на следующем этапе).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Марка / модель / госномер *">
              <Input
                value={values.vehicle_kind}
                onChange={(e) => set("vehicle_kind", e.target.value)}
                placeholder="ГАЗель А123БВ 77"
                maxLength={255}
                required
              />
            </Field>
            <Field label="Тип кузова">
              <Input
                value={values.body_type}
                onChange={(e) => set("body_type", e.target.value)}
                placeholder="Тент, изотерм, рефрижератор…"
                maxLength={120}
              />
            </Field>
            <Field label="Грузоподъёмность, т">
              <Input
                inputMode="decimal"
                placeholder="1,5"
                value={values.payload_kg}
                onChange={(e) => set("payload_kg", e.target.value)}
              />
            </Field>
            <Field label="Объём, м³">
              <Input
                type="number"
                inputMode="decimal"
                value={values.volume_m3}
                onChange={(e) => set("volume_m3", e.target.value)}
              />
            </Field>
            <Field label="Длина, м">
              <Input
                type="number"
                inputMode="decimal"
                value={values.length_m}
                onChange={(e) => set("length_m", e.target.value)}
              />
            </Field>
            <Field label="Ширина, м">
              <Input
                type="number"
                inputMode="decimal"
                value={values.width_m}
                onChange={(e) => set("width_m", e.target.value)}
              />
            </Field>
            <Field label="Высота, м">
              <Input
                type="number"
                inputMode="decimal"
                value={values.height_m}
                onChange={(e) => set("height_m", e.target.value)}
              />
            </Field>
            <Field label="Город готовности">
              <CityCombobox
                value={values.home_city}
                onChange={(v) => set("home_city", v)}
                placeholder="Москва, Краснодар, ст-ца Каневская…"
              />
            </Field>
            <Field label="Дата готовности">
              <Input
                type="date"
                value={values.ready_date}
                onChange={(e) => set("ready_date", e.target.value)}
              />
            </Field>
            <Field label="Статус">
              <Select
                value={values.dispatcher_status}
                onValueChange={(v) => set("dispatcher_status", v as VehicleStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {VEHICLE_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {drivers.length > 0 && (
              <Field label="Назначенный водитель">
                <Select
                  value={values.dispatcher_driver_ext_id || "__none"}
                  onValueChange={(v) =>
                    set("dispatcher_driver_ext_id", v === "__none" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Без водителя" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Без водителя</SelectItem>
                    {drivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.full_name ?? "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">Способ загрузки</Label>
            <div className="flex flex-wrap gap-2">
              {LOAD_METHODS.map((m) => {
                const on = values.load_methods.includes(m);
                return (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant={on ? "default" : "outline"}
                    onClick={() => toggleLoadMethod(m)}
                  >
                    {LOAD_METHOD_LABELS[m]}
                  </Button>
                );
              })}
            </div>
          </div>
          <Field label="Комментарий">
            <Textarea
              value={values.dispatcher_comment}
              onChange={(e) => set("dispatcher_comment", e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {initial ? "Сохранить" : "Добавить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}
