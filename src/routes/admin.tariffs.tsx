import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Receipt, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/admin/tariffs")({
  head: () => ({
    meta: [
      { title: "Тарифы доставки — Радиус Трек" },
      { name: "description", content: "Настройка тарифов доставки по складам" },
    ],
  }),
  component: TariffsPage,
});

type TariffKind =
  | "fixed_city"
  | "fixed_zone"
  | "fixed_direction"
  | "per_km_round"
  | "per_km_last"
  | "per_point"
  | "combo"
  | "percent_goods"
  | "manual";

type Tariff = {
  id: string;
  warehouse_id: string;
  name: string;
  kind: TariffKind;
  city: string | null;
  zone: string | null;
  destination_city: string | null;
  locality: string | null;
  radius_km: number | null;
  fixed_price: number | null;
  price_per_km: number | null;
  price_per_point: number | null;
  base_price: number | null;
  goods_percent: number | null;
  min_price: number | null;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
  priority: number;
  comment: string | null;
};

type Warehouse = { id: string; name: string; city: string | null };

const KIND_LABELS: Record<TariffKind, string> = {
  fixed_city: "Фикс. цена по городу",
  fixed_zone: "Фикс. цена по зоне",
  fixed_direction: "Фикс. по направлению",
  per_km_round: "За км кругорейса",
  per_km_last: "За км до последнего",
  per_point: "За точку",
  combo: "Комбо (база + км + точка)",
  percent_goods: "% от стоимости товара",
  manual: "Ручная цена",
};

function TariffsPage() {
  const qc = useQueryClient();
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [editing, setEditing] = useState<Tariff | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-min-city"],
    queryFn: async (): Promise<Warehouse[]> => {
      const { data, error } = await db
        .from("warehouses")
        .select("id, name, city")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Warehouse[];
    },
  });

  const { data: tariffs, isLoading } = useQuery({
    queryKey: ["delivery-tariffs"],
    queryFn: async (): Promise<Tariff[]> => {
      const { data, error } = await db
        .from("delivery_tariffs")
        .select("*")
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tariff[];
    },
  });

  const warehouseById = useMemo(() => {
    const m = new Map<string, Warehouse>();
    (warehouses ?? []).forEach((w) => m.set(w.id, w));
    return m;
  }, [warehouses]);

  const filtered = useMemo(() => {
    return (tariffs ?? []).filter((t) =>
      warehouseId === "all" ? true : t.warehouse_id === warehouseId
    );
  }, [tariffs, warehouseId]);

  const toggleActive = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await db
        .from("delivery_tariffs")
        .update({ is_active: value })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-tariffs"] });
      toast.success("Сохранено");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeTariff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("delivery_tariffs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-tariffs"] });
      toast.success("Тариф удалён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <Receipt className="h-6 w-6 text-primary" />
              Тарифы доставки
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Настройки расчёта стоимости доставки по каждому складу
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Новый тариф
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Склад" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все склады</SelectItem>
              {(warehouses ?? []).map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Склад</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>География</TableHead>
                <TableHead className="text-right">Цена</TableHead>
                <TableHead className="text-right">Мин.</TableHead>
                <TableHead>Период</TableHead>
                <TableHead className="text-center">Активен</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    Загрузка…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    Тарифов пока нет
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((t) => {
                  const wh = warehouseById.get(t.warehouse_id);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-sm">{wh?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{KIND_LABELS[t.kind]}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.kind === "fixed_direction"
                          ? `${t.city ?? "—"} → ${t.destination_city ?? "—"}`
                          : t.kind === "fixed_zone"
                            ? `Зона: ${t.zone ?? "—"}`
                            : t.kind === "fixed_city"
                              ? `Город: ${t.city ?? "—"}`
                              : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {priceLabel(t)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {t.min_price != null ? `${fmt(t.min_price)} ₽` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.valid_from || t.valid_to
                          ? `${t.valid_from ?? "…"} → ${t.valid_to ?? "…"}`
                          : "бессрочно"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={t.is_active}
                          onCheckedChange={(v) => toggleActive.mutate({ id: t.id, value: v })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setEditing(t)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(`Удалить тариф «${t.name}»?`)) removeTariff.mutate(t.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      <TariffEditor
        open={creating || !!editing}
        tariff={editing}
        warehouses={warehouses ?? []}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function priceLabel(t: Tariff): string {
  switch (t.kind) {
    case "fixed_city":
    case "fixed_zone":
    case "fixed_direction":
    case "manual":
      return t.fixed_price != null ? `${fmt(t.fixed_price)} ₽` : "—";
    case "per_km_round":
    case "per_km_last":
      return t.price_per_km != null ? `${fmt(t.price_per_km)} ₽/км` : "—";
    case "per_point":
      return t.price_per_point != null ? `${fmt(t.price_per_point)} ₽/точка` : "—";
    case "combo":
      return [
        t.base_price != null ? `${fmt(t.base_price)} ₽` : null,
        t.price_per_km != null ? `+ ${fmt(t.price_per_km)} ₽/км` : null,
        t.price_per_point != null ? `+ ${fmt(t.price_per_point)} ₽/точка` : null,
      ]
        .filter(Boolean)
        .join(" ");
    case "percent_goods":
      return t.goods_percent != null ? `${fmt(t.goods_percent)} %` : "—";
    default:
      return "—";
  }
}

function fmt(n: number) {
  return Number(n).toLocaleString("ru-RU");
}

// ---------- Editor ----------

const tariffSchema = z.object({
  warehouse_id: z.string().uuid({ message: "Выберите склад" }),
  name: z.string().trim().min(1, "Введите название").max(200),
  kind: z.enum([
    "fixed_city",
    "fixed_zone",
    "fixed_direction",
    "per_km_round",
    "per_km_last",
    "per_point",
    "combo",
    "percent_goods",
    "manual",
  ]),
  city: z.string().trim().max(120).nullable(),
  zone: z.string().trim().max(120).nullable(),
  destination_city: z.string().trim().max(120).nullable(),
  fixed_price: z.number().nonnegative().nullable(),
  price_per_km: z.number().nonnegative().nullable(),
  price_per_point: z.number().nonnegative().nullable(),
  base_price: z.number().nonnegative().nullable(),
  goods_percent: z.number().min(0).max(100).nullable(),
  min_price: z.number().nonnegative().nullable(),
  priority: z.number().int().min(0).max(9999),
  valid_from: z.string().nullable(),
  valid_to: z.string().nullable(),
  is_active: z.boolean(),
  comment: z.string().trim().max(1000).nullable(),
});

function TariffEditor({
  open,
  tariff,
  warehouses,
  onClose,
}: {
  open: boolean;
  tariff: Tariff | null;
  warehouses: Warehouse[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!tariff;

  const [form, setForm] = useState<Partial<Tariff>>(() => initial(tariff));

  // Reset when opened with different tariff
  useMemo(() => {
    if (open) setForm(initial(tariff));
  }, [open, tariff]);

  const save = useMutation({
    mutationFn: async () => {
      const numOrNull = (v: unknown) =>
        v === "" || v === null || v === undefined ? null : Number(v);
      const parsed = tariffSchema.safeParse({
        warehouse_id: form.warehouse_id ?? "",
        name: form.name ?? "",
        kind: (form.kind as TariffKind) ?? "fixed_city",
        city: form.city ?? null,
        zone: form.zone ?? null,
        destination_city: form.destination_city ?? null,
        fixed_price: numOrNull(form.fixed_price),
        price_per_km: numOrNull(form.price_per_km),
        price_per_point: numOrNull(form.price_per_point),
        base_price: numOrNull(form.base_price),
        goods_percent: numOrNull(form.goods_percent),
        min_price: numOrNull(form.min_price),
        priority: form.priority ?? 100,
        valid_from: form.valid_from || null,
        valid_to: form.valid_to || null,
        is_active: form.is_active ?? true,
        comment: form.comment ?? null,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Проверьте поля");
      if (isEdit && tariff) {
        const { error } = await db.from("delivery_tariffs").update(parsed.data).eq("id", tariff.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("delivery_tariffs").insert(parsed.data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-tariffs"] });
      toast.success(isEdit ? "Тариф обновлён" : "Тариф создан");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const kind = (form.kind as TariffKind) ?? "fixed_city";
  const showFixed = ["fixed_city", "fixed_zone", "fixed_direction", "manual"].includes(kind);
  const showKm = ["per_km_round", "per_km_last", "combo"].includes(kind);
  const showPoint = ["per_point", "combo"].includes(kind);
  const showBase = kind === "combo";
  const showPercent = kind === "percent_goods";
  const showCity = ["fixed_city", "fixed_direction"].includes(kind);
  const showZone = kind === "fixed_zone";
  const showDestCity = kind === "fixed_direction";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Редактирование: ${tariff?.name}` : "Новый тариф"}</DialogTitle>
          <DialogDescription>Параметры расчёта стоимости доставки</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Склад *</Label>
              <Select
                value={form.warehouse_id ?? ""}
                onValueChange={(v) => setForm((f) => ({ ...f, warehouse_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите склад" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Тип расчёта *</Label>
              <Select
                value={kind}
                onValueChange={(v) => setForm((f) => ({ ...f, kind: v as TariffKind }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABELS) as TariffKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Название тарифа *</Label>
            <Input
              value={form.name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Напр., «Краснодар — город 1500 ₽»"
              maxLength={200}
            />
          </div>

          {(showCity || showZone || showDestCity) && (
            <div className="grid grid-cols-3 gap-3">
              {showCity && (
                <div>
                  <Label>Город {showDestCity ? "(откуда)" : ""}</Label>
                  <Input
                    value={form.city ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="Краснодар"
                  />
                </div>
              )}
              {showDestCity && (
                <div>
                  <Label>Город назначения</Label>
                  <Input
                    value={form.destination_city ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, destination_city: e.target.value }))
                    }
                    placeholder="Сочи"
                  />
                </div>
              )}
              {showZone && (
                <div>
                  <Label>Зона доставки</Label>
                  <Input
                    value={form.zone ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
                    placeholder="Северная зона"
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {showFixed && (
              <NumField
                label="Фикс. цена, ₽"
                value={form.fixed_price}
                onChange={(v) => setForm((f) => ({ ...f, fixed_price: v }))}
              />
            )}
            {showBase && (
              <NumField
                label="База, ₽"
                value={form.base_price}
                onChange={(v) => setForm((f) => ({ ...f, base_price: v }))}
              />
            )}
            {showKm && (
              <NumField
                label="Цена за км, ₽"
                value={form.price_per_km}
                onChange={(v) => setForm((f) => ({ ...f, price_per_km: v }))}
              />
            )}
            {showPoint && (
              <NumField
                label="Цена за точку, ₽"
                value={form.price_per_point}
                onChange={(v) => setForm((f) => ({ ...f, price_per_point: v }))}
              />
            )}
            {showPercent && (
              <NumField
                label="% от стоимости товара"
                value={form.goods_percent}
                onChange={(v) => setForm((f) => ({ ...f, goods_percent: v }))}
              />
            )}
            <NumField
              label="Минимальная цена, ₽"
              value={form.min_price}
              onChange={(v) => setForm((f) => ({ ...f, min_price: v }))}
            />
            <NumField
              label="Приоритет"
              value={form.priority ?? 100}
              onChange={(v) => setForm((f) => ({ ...f, priority: v ?? 100 }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Действует с</Label>
              <Input
                type="date"
                value={form.valid_from ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value || null }))}
              />
            </div>
            <div>
              <Label>Действует по</Label>
              <Input
                type="date"
                value={form.valid_to ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, valid_to: e.target.value || null }))}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={form.is_active ?? true}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
            />
            <Label>Тариф активен</Label>
          </div>

          <div>
            <Label>Комментарий</Label>
            <Textarea
              value={form.comment ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
              rows={2}
              maxLength={1000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Отмена
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Сохранение…" : isEdit ? "Сохранить" : "Создать тариф"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        step="0.01"
        min="0"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </div>
  );
}

function initial(t: Tariff | null): Partial<Tariff> {
  return (
    t ?? {
      kind: "fixed_city",
      is_active: true,
      priority: 100,
    }
  );
}
