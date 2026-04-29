import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Settings as SettingsIcon, Save } from "lucide-react";

export const Route = createFileRoute("/warehouse-settings")({
  head: () => ({
    meta: [
      { title: "Настройки склада — Радиус Трек" },
      {
        name: "description",
        content: "Рабочее время склада, ответственный, контакты.",
      },
    ],
  }),
  component: WarehouseSettingsPage,
});

const DAYS: { key: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"; label: string }[] = [
  { key: "mon", label: "Понедельник" },
  { key: "tue", label: "Вторник" },
  { key: "wed", label: "Среда" },
  { key: "thu", label: "Четверг" },
  { key: "fri", label: "Пятница" },
  { key: "sat", label: "Суббота" },
  { key: "sun", label: "Воскресенье" },
];

type DayCfg = { enabled: boolean; open: string; close: string };
type WorkingHours = Record<(typeof DAYS)[number]["key"], DayCfg>;
type Break = { label: string; start: string; end: string };

const DEFAULT_HOURS: WorkingHours = {
  mon: { enabled: true, open: "08:00", close: "18:00" },
  tue: { enabled: true, open: "08:00", close: "18:00" },
  wed: { enabled: true, open: "08:00", close: "18:00" },
  thu: { enabled: true, open: "08:00", close: "18:00" },
  fri: { enabled: true, open: "08:00", close: "18:00" },
  sat: { enabled: false, open: "09:00", close: "14:00" },
  sun: { enabled: false, open: "09:00", close: "14:00" },
};

function WarehouseSettingsPage() {
  const qc = useQueryClient();
  const [warehouseId, setWarehouseId] = useState<string>("");

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-list-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id,name,city")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!warehouseId && warehouses && warehouses.length > 0) {
      setWarehouseId(warehouses[0].id);
    }
  }, [warehouses, warehouseId]);

  const { data: wh } = useQuery({
    queryKey: ["warehouse-settings", warehouseId],
    enabled: !!warehouseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("id", warehouseId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<{
    name: string;
    city: string;
    address: string;
    manager_name: string;
    manager_phone: string;
    phone: string;
    notes: string;
    working_hours: WorkingHours;
    breaks: Break[];
  }>({
    name: "",
    city: "",
    address: "",
    manager_name: "",
    manager_phone: "",
    phone: "",
    notes: "",
    working_hours: DEFAULT_HOURS,
    breaks: [{ label: "Обед", start: "12:00", end: "13:00" }],
  });

  useEffect(() => {
    if (!wh) return;
    setForm({
      name: wh.name ?? "",
      city: wh.city ?? "",
      address: wh.address ?? "",
      manager_name: wh.manager_name ?? wh.contact_person ?? "",
      manager_phone: wh.manager_phone ?? "",
      phone: wh.phone ?? "",
      notes: wh.notes ?? "",
      working_hours: { ...DEFAULT_HOURS, ...((wh.working_hours as Partial<WorkingHours>) || {}) } as WorkingHours,
      breaks:
        Array.isArray(wh.breaks) && wh.breaks.length > 0
          ? (wh.breaks as Break[])
          : [{ label: "Обед", start: "12:00", end: "13:00" }],
    });
  }, [wh]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("warehouses")
        .update({
          name: form.name,
          city: form.city || null,
          address: form.address || null,
          manager_name: form.manager_name || null,
          manager_phone: form.manager_phone || null,
          phone: form.phone || null,
          notes: form.notes || null,
          working_hours: form.working_hours,
          breaks: form.breaks,
        })
        .eq("id", warehouseId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Настройки склада сохранены");
      qc.invalidateQueries({ queryKey: ["warehouse-settings", warehouseId] });
      qc.invalidateQueries({ queryKey: ["warehouses-list-settings"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Не удалось сохранить"),
  });

  const setDay = (key: (typeof DAYS)[number]["key"], patch: Partial<DayCfg>) => {
    setForm((f) => ({
      ...f,
      working_hours: { ...f.working_hours, [key]: { ...f.working_hours[key], ...patch } },
    }));
  };

  const setBreak = (idx: number, patch: Partial<Break>) => {
    setForm((f) => ({
      ...f,
      breaks: f.breaks.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    }));
  };

  const addBreak = () =>
    setForm((f) => ({
      ...f,
      breaks: [...f.breaks, { label: "Перерыв", start: "15:00", end: "15:15" }],
    }));

  const removeBreak = (idx: number) =>
    setForm((f) => ({ ...f, breaks: f.breaks.filter((_, i) => i !== idx) }));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-2">
          <SettingsIcon className="h-5 w-5" />
          <h1 className="text-2xl font-semibold">Настройки склада</h1>
        </div>

        <div className="mb-6">
          <Label className="mb-1 block text-sm">Склад</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-full sm:w-[360px]">
              <SelectValue placeholder="Выберите склад" />
            </SelectTrigger>
            <SelectContent>
              {(warehouses ?? []).map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name} {w.city ? `· ${w.city}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {warehouseId && (
          <div className="space-y-6 rounded-lg border border-border bg-card p-5">
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1 block text-sm">Название склада</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1 block text-sm">Город</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label className="mb-1 block text-sm">Адрес</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1 block text-sm">Ответственный начальник склада</Label>
                <Input
                  value={form.manager_name}
                  onChange={(e) => setForm({ ...form, manager_name: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1 block text-sm">Телефон начальника</Label>
                <Input
                  value={form.manager_phone}
                  onChange={(e) => setForm({ ...form, manager_phone: e.target.value })}
                  placeholder="+7..."
                />
              </div>
              <div>
                <Label className="mb-1 block text-sm">Телефон склада</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+7..."
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="mb-1 block text-sm">Комментарий</Label>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold">Рабочие дни и время</h2>
              <div className="space-y-2">
                {DAYS.map(({ key, label }) => {
                  const d = form.working_hours[key];
                  return (
                    <div
                      key={key}
                      className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
                    >
                      <label className="flex w-40 items-center gap-2">
                        <Checkbox
                          checked={d.enabled}
                          onCheckedChange={(v) => setDay(key, { enabled: !!v })}
                        />
                        <span className="text-sm font-medium">{label}</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">с</span>
                        <Input
                          type="time"
                          className="w-28"
                          value={d.open}
                          disabled={!d.enabled}
                          onChange={(e) => setDay(key, { open: e.target.value })}
                        />
                        <span className="text-xs text-muted-foreground">до</span>
                        <Input
                          type="time"
                          className="w-28"
                          value={d.close}
                          disabled={!d.enabled}
                          onChange={(e) => setDay(key, { close: e.target.value })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Обед / перерывы</h2>
                <Button type="button" variant="outline" size="sm" onClick={addBreak}>
                  + Добавить
                </Button>
              </div>
              <div className="space-y-2">
                {form.breaks.map((b, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
                    <Input
                      className="w-40"
                      value={b.label}
                      onChange={(e) => setBreak(i, { label: e.target.value })}
                      placeholder="Название"
                    />
                    <Input
                      type="time"
                      className="w-28"
                      value={b.start}
                      onChange={(e) => setBreak(i, { start: e.target.value })}
                    />
                    <span className="text-xs text-muted-foreground">—</span>
                    <Input
                      type="time"
                      className="w-28"
                      value={b.end}
                      onChange={(e) => setBreak(i, { end: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeBreak(i)}
                      className="ml-auto text-destructive"
                    >
                      Удалить
                    </Button>
                  </div>
                ))}
                {form.breaks.length === 0 && (
                  <div className="text-sm text-muted-foreground">Перерывы не заданы</div>
                )}
              </div>
            </section>

            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name}>
                <Save className="mr-2 h-4 w-4" />
                Сохранить
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
