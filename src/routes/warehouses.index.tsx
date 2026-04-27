import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Warehouse as WarehouseIcon, MapPin, Phone, User, Clock, ChevronRight } from "lucide-react";
import type { Warehouse } from "@/lib/routes";
import { parseWorkingHours, workingHoursSummary } from "@/lib/warehouses";

export const Route = createFileRoute("/warehouses/")({
  head: () => ({ meta: [{ title: "Склады — Радиус Трек" }] }),
  component: WarehousesPage,
});

function WarehousesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [contact, setContact] = useState("");

  const { data: warehouses, isLoading } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async (): Promise<Warehouse[]> => {
      const { data, error } = await db.from("warehouses").select("*").order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Укажите название склада");
      const { error } = await db.from("warehouses").insert({
        name: name.trim(),
        city: city.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
        contact_person: contact.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Склад добавлен");
      setOpen(false);
      setName(""); setCity(""); setAddress(""); setPhone(""); setContact("");
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
            <p className="mt-1 text-sm text-muted-foreground">Точки отправки маршрутов и возвратов</p>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Добавить склад
          </Button>
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
              <div key={w.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-foreground">{w.name}</div>
                    {w.city && <div className="text-xs text-muted-foreground">{w.city}</div>}
                  </div>
                  {!w.is_active && (
                    <Badge variant="outline" className="border-border bg-secondary text-[10px] text-muted-foreground">
                      Неактивен
                    </Badge>
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
            <DialogTitle>Новый склад</DialogTitle>
            <DialogDescription>Точка отправки и возвратов для маршрутов</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label>Название *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" placeholder="Склад №1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Город</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label>Телефон</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label>Адрес</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Контактное лицо</Label>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} className="mt-1.5" />
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
    </div>
  );
}
