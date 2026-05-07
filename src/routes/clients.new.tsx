import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Save, ArrowLeft } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export const Route = createFileRoute("/clients/new")({
  head: () => ({
    meta: [
      { title: "Новый получатель — Радиус Трек" },
      {
        name: "description",
        content: "Карточка получателя с режимом работы и контактами.",
      },
    ],
  }),
  component: NewClientPage,
});

const WEEKDAYS: Array<{ id: number; short: string; long: string }> = [
  { id: 1, short: "Пн", long: "Понедельник" },
  { id: 2, short: "Вт", long: "Вторник" },
  { id: 3, short: "Ср", long: "Среда" },
  { id: 4, short: "Чт", long: "Четверг" },
  { id: 5, short: "Пт", long: "Пятница" },
  { id: 6, short: "Сб", long: "Суббота" },
  { id: 7, short: "Вс", long: "Воскресенье" },
];

const formSchema = z.object({
  name: z.string().trim().min(1, "Название обязательно").max(255),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  comment: z.string().trim().max(2000).optional().or(z.literal("")),
  driver_instructions: z.string().trim().max(2000).optional().or(z.literal("")),
  unloading_notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

type FormValues = {
  name: string;
  address: string;
  primary_contact_name: string;
  primary_contact_phone: string;
  secondary_contact_name: string;
  secondary_contact_phone: string;
  phone: string;
  comment: string;
  internal_notes: string;
  reception_start: string;
  reception_end: string;
  lunch_start: string;
  lunch_end: string;
  time_restrictions: string;
  works_weekends: boolean;
  unloading_notes: string;
  driver_instructions: string;
  assigned_manager_id: string;
  avg_unload_minutes: string;
};

const initial: FormValues = {
  name: "",
  address: "",
  primary_contact_name: "",
  primary_contact_phone: "",
  secondary_contact_name: "",
  secondary_contact_phone: "",
  phone: "",
  comment: "",
  internal_notes: "",
  reception_start: "09:00",
  reception_end: "18:00",
  lunch_start: "13:00",
  lunch_end: "14:00",
  time_restrictions: "",
  works_weekends: false,
  unloading_notes: "",
  driver_instructions: "",
  assigned_manager_id: "",
  avg_unload_minutes: "30",
};

function NewClientPage() {
  const navigate = useNavigate();
  const { user, roles, profile } = useAuth();

  const allowed = roles.some((r) => r === "admin" || r === "logist" || r === "manager");

  const [values, setValues] = useState<FormValues>(initial);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) =>
    setValues((s) => ({ ...s, [k]: v }));

  const managersQuery = useQuery({
    queryKey: ["managers", "active-list"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("managers")
        .select("id, full_name, is_active")
        .eq("is_active", true)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Если у пользователя есть запись менеджера с тем же ФИО — выбираем по умолчанию
  useEffect(() => {
    if (values.assigned_manager_id) return;
    const list = managersQuery.data ?? [];
    if (!list.length) return;
    const myName = profile?.full_name?.trim().toLowerCase();
    if (!myName) return;
    const mine = list.find((m) => (m.full_name ?? "").trim().toLowerCase() === myName);
    if (mine) set("assigned_manager_id", mine.id);
  }, [managersQuery.data, profile?.full_name, values.assigned_manager_id]);

  const toggleDay = (id: number) =>
    setWorkingDays((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id].sort()));

  const formattedWorkingHours = useMemo(() => {
    const days = workingDays
      .map((id) => WEEKDAYS.find((w) => w.id === id)?.short)
      .filter(Boolean)
      .join(",");
    const time =
      values.reception_start && values.reception_end
        ? `${values.reception_start}–${values.reception_end}`
        : "";
    return [days, time].filter(Boolean).join(" ");
  }, [workingDays, values.reception_start, values.reception_end]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const parsed = formSchema.parse({
        name: values.name,
        address: values.address,
        phone: values.phone,
        comment: values.comment,
        driver_instructions: values.driver_instructions,
        unloading_notes: values.unloading_notes,
      });

      const avg = Number(values.avg_unload_minutes);
      const extra: Record<string, unknown> = {
        assigned_manager_id: values.assigned_manager_id || null,
        primary_contact_name: values.primary_contact_name || null,
        primary_contact_phone: values.primary_contact_phone || null,
        secondary_contact_name: values.secondary_contact_name || null,
        secondary_contact_phone: values.secondary_contact_phone || null,
        internal_notes: values.internal_notes || null,
        working_days: workingDays,
        reception_start: values.reception_start || null,
        reception_end: values.reception_end || null,
        lunch_start: values.lunch_start || null,
        lunch_end: values.lunch_end || null,
        time_restrictions: values.time_restrictions || null,
        avg_unload_minutes: Number.isFinite(avg) && avg > 0 ? avg : null,
        created_by_user_id: user?.id ?? null,
      };

      const payload = {
        name: parsed.name,
        address: parsed.address || null,
        phone: parsed.phone || values.primary_contact_phone || null,
        phone_alt: values.secondary_contact_phone || null,
        working_hours: formattedWorkingHours || null,
        works_weekends: values.works_weekends,
        unloading_notes: parsed.unloading_notes || null,
        driver_instructions: parsed.driver_instructions || null,
        preferred_delivery_time:
          values.reception_start && values.reception_end
            ? `${values.reception_start}-${values.reception_end}`
            : null,
        access_notes: parsed.comment || null,
        source: "manual" as const,
        extra_attrs: extra as never,
      };

      const { data, error } = await supabase
        .from("clients")
        .insert(payload as never)
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      toast.success("Получатель сохранён");
      navigate({ to: "/orders" });
    },
    onError: (e: Error) => {
      toast.error(e.message || "Не удалось сохранить получателя");
    },
  });

  if (!allowed) {
    return (
      <>
        <AppHeader />
        <main className="container mx-auto p-4">
          <Alert variant="destructive">
            <AlertDescription>
              Доступно только менеджерам, логистам и администраторам.
            </AlertDescription>
          </Alert>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="container mx-auto max-w-3xl space-y-6 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Новый получатель</h1>
            <p className="text-sm text-muted-foreground">
              Заполните карточку — поля доп. контакта и внутренней информации видны только
              закреплённому менеджеру, логисту и администраторам.
            </p>
          </div>
          <Button variant="ghost" onClick={() => navigate({ to: "/orders" })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Назад
          </Button>
        </div>

        <section className="rounded-lg border bg-card p-4 space-y-4">
          <h2 className="font-medium">Основное</h2>
          <div className="grid gap-3">
            <Field label="Название организации *">
              <Input
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="ООО «Ромашка»"
                maxLength={255}
              />
            </Field>
            <Field label="Адрес">
              <Input
                value={values.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="г. Москва, ул. Примерная, 1"
                maxLength={500}
              />
            </Field>
            <Field label="Телефон (общий)">
              <Input
                value={values.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+7 999 000-00-00"
                maxLength={50}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4 space-y-4">
          <h2 className="font-medium">Контакты</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Основной контакт — ФИО">
              <Input
                value={values.primary_contact_name}
                onChange={(e) => set("primary_contact_name", e.target.value)}
                maxLength={255}
              />
            </Field>
            <Field label="Основной контакт — телефон">
              <Input
                value={values.primary_contact_phone}
                onChange={(e) => set("primary_contact_phone", e.target.value)}
                maxLength={50}
              />
            </Field>
            <Field label="Доп. контакт — ФИО (закрытое)">
              <Input
                value={values.secondary_contact_name}
                onChange={(e) => set("secondary_contact_name", e.target.value)}
                maxLength={255}
              />
            </Field>
            <Field label="Доп. контакт — телефон (закрытое)">
              <Input
                value={values.secondary_contact_phone}
                onChange={(e) => set("secondary_contact_phone", e.target.value)}
                maxLength={50}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4 space-y-4">
          <h2 className="font-medium">Режим работы</h2>
          <div>
            <Label className="mb-2 block">Рабочие дни</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const active = workingDays.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDay(d.id)}
                    className={
                      "rounded-md border px-3 py-1.5 text-sm transition-colors " +
                      (active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background hover:bg-accent")
                    }
                    aria-pressed={active}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Приём с">
              <Input
                type="time"
                value={values.reception_start}
                onChange={(e) => set("reception_start", e.target.value)}
              />
            </Field>
            <Field label="Приём до">
              <Input
                type="time"
                value={values.reception_end}
                onChange={(e) => set("reception_end", e.target.value)}
              />
            </Field>
            <Field label="Обед с">
              <Input
                type="time"
                value={values.lunch_start}
                onChange={(e) => set("lunch_start", e.target.value)}
              />
            </Field>
            <Field label="Обед до">
              <Input
                type="time"
                value={values.lunch_end}
                onChange={(e) => set("lunch_end", e.target.value)}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Принимает в выходные</div>
              <div className="text-xs text-muted-foreground">
                Учитывается при планировании маршрута
              </div>
            </div>
            <Switch
              checked={values.works_weekends}
              onCheckedChange={(v) => set("works_weekends", v)}
            />
          </div>

          <Field label="Ограничения по времени доставки">
            <Textarea
              value={values.time_restrictions}
              onChange={(e) => set("time_restrictions", e.target.value)}
              placeholder="Напр.: только до 16:00, окно 10:00–12:00 и т.п."
              rows={2}
              maxLength={1000}
            />
          </Field>

          <Field label="Среднее время разгрузки, мин">
            <Input
              type="number"
              min={0}
              max={600}
              value={values.avg_unload_minutes}
              onChange={(e) => set("avg_unload_minutes", e.target.value)}
            />
          </Field>
        </section>

        <section className="rounded-lg border bg-card p-4 space-y-4">
          <h2 className="font-medium">Ограничения и инструкции</h2>
          <Field label="Ограничения по разгрузке">
            <Textarea
              value={values.unloading_notes}
              onChange={(e) => set("unloading_notes", e.target.value)}
              placeholder="Напр.: только хвостовой подъезд, рохля до 500 кг."
              rows={2}
              maxLength={2000}
            />
          </Field>
          <Field label="Комментарий для водителя">
            <Textarea
              value={values.driver_instructions}
              onChange={(e) => set("driver_instructions", e.target.value)}
              placeholder="Звонить заранее, въезд через шлагбаум…"
              rows={2}
              maxLength={2000}
            />
          </Field>
          <Field label="Комментарий (общий)">
            <Textarea
              value={values.comment}
              onChange={(e) => set("comment", e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </Field>
        </section>

        <section className="rounded-lg border bg-card p-4 space-y-4">
          <h2 className="font-medium">Привязка и внутренняя информация</h2>
          <Field label="Закреплённый менеджер *">
            <Select
              value={values.assigned_manager_id}
              onValueChange={(v) => set("assigned_manager_id", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите менеджера" />
              </SelectTrigger>
              <SelectContent>
                {(managersQuery.data ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Внутренняя информация (закрытое)">
            <Textarea
              value={values.internal_notes}
              onChange={(e) => set("internal_notes", e.target.value)}
              placeholder="Видна только закреплённому менеджеру, логисту и администраторам."
              rows={3}
              maxLength={4000}
            />
          </Field>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked disabled />
            Доп. контакт и внутренняя информация скрыты от водителей и сторонних пользователей.
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/orders" })}>
            Отмена
          </Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !values.name.trim() || !values.assigned_manager_id}
          >
            <Save className="mr-2 h-4 w-4" />
            {saveMut.isPending ? "Сохранение…" : "Сохранить нового получателя"}
          </Button>
        </div>
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}
