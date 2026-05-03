import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { fetchListViaApi } from "@/lib/api-client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Plus,
  Warehouse as WarehouseIcon,
  MapPin,
  Phone,
  User,
  Pencil,
  Trash2,
  ChevronRight,
} from "lucide-react";
import type { Warehouse } from "@/lib/routes";
import { useAuth } from "@/lib/auth/auth-context";

export const Route = createFileRoute("/warehouses/")({
  head: () => ({ meta: [{ title: "Склады — Радиус Трек" }] }),
  component: WarehousesPage,
});

type WarehouseForm = {
  name: string;
  city: string;
  address: string;
  contact_person: string;
  phone: string;
  working_hours_text: string;
  notes: string;
  is_active: boolean;
};

const EMPTY_FORM: WarehouseForm = {
  name: "",
  city: "",
  address: "",
  contact_person: "",
  phone: "",
  working_hours_text: "",
  notes: "",
  is_active: true,
};

function WarehousesPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");

  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<WarehouseForm>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<Warehouse | null>(null);

  const { data: warehouses, isLoading, refetch } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async (): Promise<Warehouse[]> => {
      const { rows } = await fetchListViaApi<Warehouse>("/api/warehouses", {
        limit: 100,
      });
      return rows;
    },
    staleTime: 10 * 60_000,
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(w: Warehouse) {
    setEditing(w);
    setForm({
      name: w.name ?? "",
      city: w.city ?? "",
      address: w.address ?? "",
      contact_person: w.contact_person ?? "",
      phone: w.phone ?? "",
      working_hours_text:
        typeof (w as { working_hours_text?: string }).working_hours_text === "string"
          ? ((w as { working_hours_text?: string }).working_hours_text ?? "")
          : "",
      notes: (w as { notes?: string | null }).notes ?? "",
      is_active: w.is_active ?? true,
    });
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Укажите название склада");
      const payload = {
        name: form.name.trim(),
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        contact_person: form.contact_person.trim() || null,
        phone: form.phone.trim() || null,
        notes:
          [form.working_hours_text.trim() ? `График работы: ${form.working_hours_text.trim()}` : "", form.notes.trim()]
            .filter(Boolean)
            .join("\n") || null,
        is_active: form.is_active,
      };
      if (editing) {
        const { error } = await db.from("warehouses").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("warehouses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success(editing ? "Склад обновлён" : "Склад добавлен");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (w: Warehouse) => {
      const { error } = await db
        .from("warehouses")
        .update({ is_active: !w.is_active })
        .eq("id", w.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (w: Warehouse) => {
      // Проверка связей: заказы, маршруты, остатки.
      const checks = await Promise.all([
        supabase.from("routes").select("id", { count: "exact", head: true }).eq("warehouse_id", w.id),
        supabase
          .from("stock_balances" as never)
          .select("product_id", { count: "exact", head: true })
          .eq("warehouse_id", w.id),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("warehouse_id", w.id),
      ]);
      const labels = ["маршруты", "остатки", "товары"];
      const blockers = checks
        .map((r, i) => ({ count: r.count ?? 0, label: labels[i] }))
        .filter((b) => b.count > 0);
      if (blockers.length > 0) {
        throw new Error(
          `Нельзя удалить склад: к нему привязаны ${blockers
            .map((b) => `${b.label} (${b.count})`)
            .join(", ")}. Сделайте склад неактивным — он останется в истории, но не будет предлагаться в новых заявках.`,
        );
      }
      const { error } = await db.from("warehouses").delete().eq("id", w.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Склад удалён");
      setConfirmDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Склады</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Точки отправки маршрутов и возвратов
            </p>
          </div>
          {isAdmin ? (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Добавить склад
            </Button>
          ) : null}
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Загрузка…</div>
        ) : (warehouses?.length ?? 0) === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card py-12 text-center">
            <WarehouseIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">Складов пока нет</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {warehouses!.map((w) => (
              <div
                key={w.id}
                className={`rounded-lg border bg-card p-4 ${
                  w.is_active ? "border-border" : "border-dashed border-border opacity-70"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        to="/warehouses/$warehouseId"
                        params={{ warehouseId: w.id }}
                        className="truncate font-semibold text-foreground hover:underline"
                      >
                        {w.name}
                      </Link>
                      {!w.is_active && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          Неактивен
                        </Badge>
                      )}
                    </div>
                    {w.city && <div className="text-xs text-muted-foreground">{w.city}</div>}
                  </div>
                  {isAdmin ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Switch
                        checked={!!w.is_active}
                        onCheckedChange={() => toggleActive.mutate(w)}
                        aria-label="Активен"
                      />
                      <Button size="icon" variant="ghost" onClick={() => openEdit(w)} aria-label="Редактировать">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setConfirmDelete(w)}
                        aria-label="Удалить"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ) : (
                    <Link
                      to="/warehouses/$warehouseId"
                      params={{ warehouseId: w.id }}
                      className="text-muted-foreground"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
                <div className="mt-3 space-y-1 text-sm text-foreground">
                  {w.address && (
                    <div className="inline-flex items-start gap-1.5">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                      {w.address}
                    </div>
                  )}
                  {w.phone && (
                    <div className="inline-flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {w.phone}
                    </div>
                  )}
                  {w.contact_person && (
                    <div className="inline-flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {w.contact_person}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать склад" : "Новый склад"}</DialogTitle>
            <DialogDescription>Точка отправки и возвратов для маршрутов</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label>Название *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1.5"
                placeholder="Склад №1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Город</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Телефон</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label>Адрес</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Контактное лицо</Label>
              <Input
                value={form.contact_person}
                onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>График работы</Label>
              <Input
                value={form.working_hours_text}
                onChange={(e) => setForm({ ...form, working_hours_text: e.target.value })}
                className="mt-1.5"
                placeholder="Пн–Пт 9:00–18:00"
              />
            </div>
            <div>
              <Label>Комментарий</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="mt-1.5"
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label className="text-sm">Активен</Label>
                <div className="text-xs text-muted-foreground">
                  Неактивные склады не предлагаются в новых заявках
                </div>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Сохранение…" : editing ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить склад?</AlertDialogTitle>
            <AlertDialogDescription>
              Действие нельзя отменить. Если к складу привязаны заказы, маршруты или остатки,
              удаление не выполнится — выключите его активность.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmDelete) remove.mutate(confirmDelete);
              }}
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {remove.isPending ? "Удаление…" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
