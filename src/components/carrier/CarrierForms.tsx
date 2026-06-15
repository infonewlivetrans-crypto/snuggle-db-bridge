import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPost, apiPatch, apiGetAuth } from "@/lib/api-client";
import { toast } from "sonner";

type Vehicle = {
  id: string;
  vehicle_kind: string | null;
  body_type: string | null;
  payload_kg: number | null;
  volume_m3: number | null;
  home_city: string | null;
  current_city: string | null;
  dispatcher_comment: string | null;
};

type DriverOption = { id: string; full_name: string | null };

export function CarrierVehicleFormDialog({
  open,
  onOpenChange,
  vehicle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vehicle?: Vehicle | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!vehicle?.id;
  const [form, setForm] = useState<Record<string, string>>(() => ({
    vehicle_kind: vehicle?.vehicle_kind ?? "",
    body_type: vehicle?.body_type ?? "",
    payload_kg: vehicle?.payload_kg != null ? String(vehicle.payload_kg) : "",
    volume_m3: vehicle?.volume_m3 != null ? String(vehicle.volume_m3) : "",
    home_city: vehicle?.home_city ?? "",
    current_city: vehicle?.current_city ?? "",
    dispatcher_comment: vehicle?.dispatcher_comment ?? "",
    dispatcher_driver_ext_id: "",
  }));

  const driversQ = useQuery({
    queryKey: ["carrier", "drivers", "select"],
    queryFn: () => apiGetAuth<{ rows: DriverOption[] }>("/api/carrier/drivers", 10000),
    enabled: open,
  });

  const mut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        vehicle_kind: form.vehicle_kind || null,
        body_type: form.body_type || null,
        payload_kg: form.payload_kg ? Number(form.payload_kg) : null,
        volume_m3: form.volume_m3 ? Number(form.volume_m3) : null,
        home_city: form.home_city || null,
        current_city: form.current_city || null,
        dispatcher_comment: form.dispatcher_comment || null,
        dispatcher_driver_ext_id: form.dispatcher_driver_ext_id || null,
      };
      if (isEdit) await apiPatch(`/api/carrier/vehicles/${vehicle!.id}`, payload);
      else await apiPost("/api/carrier/vehicles", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carrier", "vehicles"] });
      toast.success(isEdit ? "Машина обновлена" : "Машина добавлена");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось сохранить"),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактировать машину" : "Добавить машину"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Название / госномер</Label>
            <Input value={form.vehicle_kind} onChange={(e) => set("vehicle_kind", e.target.value)} placeholder="MAN TGX X123XX" />
          </div>
          <div>
            <Label>Тип кузова</Label>
            <Input value={form.body_type} onChange={(e) => set("body_type", e.target.value)} placeholder="tent / refrigerator" />
          </div>
          <div>
            <Label>Тоннаж, кг</Label>
            <Input type="number" value={form.payload_kg} onChange={(e) => set("payload_kg", e.target.value)} />
          </div>
          <div>
            <Label>Объём, м³</Label>
            <Input type="number" value={form.volume_m3} onChange={(e) => set("volume_m3", e.target.value)} />
          </div>
          <div>
            <Label>Домашний город</Label>
            <Input value={form.home_city} onChange={(e) => set("home_city", e.target.value)} />
          </div>
          <div>
            <Label>Текущий город</Label>
            <Input value={form.current_city} onChange={(e) => set("current_city", e.target.value)} placeholder="Москва" />
          </div>
          <div className="sm:col-span-2">
            <Label>Водитель</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.dispatcher_driver_ext_id}
              onChange={(e) => set("dispatcher_driver_ext_id", e.target.value)}
            >
              <option value="">— не назначен —</option>
              {(driversQ.data?.rows ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.full_name ?? d.id.slice(0, 8)}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label>Комментарий</Label>
            <Textarea value={form.dispatcher_comment} onChange={(e) => set("dispatcher_comment", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Сохранение…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CarrierDriverFormDialog({
  open,
  onOpenChange,
  driver,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  driver?: {
    id: string;
    full_name: string | null;
    phone: string | null;
    email: string | null;
    whatsapp: string | null;
    telegram: string | null;
    max_messenger: string | null;
    city: string | null;
    dispatcher_comment: string | null;
  } | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!driver?.id;
  const [form, setForm] = useState<Record<string, string>>(() => ({
    full_name: driver?.full_name ?? "",
    phone: driver?.phone ?? "",
    email: driver?.email ?? "",
    whatsapp: driver?.whatsapp ?? "",
    telegram: driver?.telegram ?? "",
    max_messenger: driver?.max_messenger ?? "",
    city: driver?.city ?? "",
    dispatcher_comment: driver?.dispatcher_comment ?? "",
    vehicle_id: "",
  }));

  const vehiclesQ = useQuery({
    queryKey: ["carrier", "vehicles", "select"],
    queryFn: () =>
      apiGetAuth<{ rows: Array<{ id: string; vehicle_kind: string | null; plate_number: string }> }>(
        "/api/carrier/vehicles",
        10000,
      ),
    enabled: open,
  });

  const mut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        full_name: form.full_name || null,
        phone: form.phone || null,
        email: form.email || null,
        whatsapp: form.whatsapp || null,
        telegram: form.telegram || null,
        max_messenger: form.max_messenger || null,
        city: form.city || null,
        dispatcher_comment: form.dispatcher_comment || null,
      };
      if (form.vehicle_id) payload.vehicle_id = form.vehicle_id;
      if (isEdit) await apiPatch(`/api/carrier/drivers/${driver!.id}`, payload);
      else await apiPost("/api/carrier/drivers", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carrier", "drivers"] });
      qc.invalidateQueries({ queryKey: ["carrier", "vehicles"] });
      toast.success(isEdit ? "Водитель обновлён" : "Водитель добавлен");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось сохранить"),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактировать водителя" : "Добавить водителя"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>ФИО</Label>
            <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
          </div>
          <div>
            <Label>Телефон</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+7…" />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          </div>
          <div>
            <Label>Telegram</Label>
            <Input value={form.telegram} onChange={(e) => set("telegram", e.target.value)} />
          </div>
          <div>
            <Label>Max</Label>
            <Input value={form.max_messenger} onChange={(e) => set("max_messenger", e.target.value)} />
          </div>
          <div>
            <Label>Город</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Закреплённая машина</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.vehicle_id}
              onChange={(e) => set("vehicle_id", e.target.value)}
            >
              <option value="">— не закреплена —</option>
              {(vehiclesQ.data?.rows ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vehicle_kind ?? v.plate_number}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label>Комментарий</Label>
            <Textarea value={form.dispatcher_comment} onChange={(e) => set("dispatcher_comment", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Сохранение…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UpdateMyLocationButton({ vehicleId }: { vehicleId: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      const pos = await new Promise<GeolocationPosition | null>((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(p),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 8000 },
        );
      });
      if (pos) {
        await apiPost(`/api/carrier/vehicles/${vehicleId}/location`, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          source: "gps",
        });
        toast.success("Координаты обновлены (GPS)");
      } else {
        const city = window.prompt("GPS недоступен. Укажите текущий город:");
        if (!city) return;
        await apiPost(`/api/carrier/vehicles/${vehicleId}/location`, { city });
        toast.success("Город обновлён, координаты определит сервер");
      }
      qc.invalidateQueries({ queryKey: ["carrier", "vehicles"] });
    } catch (e) {
      toast.error((e as Error).message || "Ошибка обновления");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={onClick} disabled={busy}>
      {busy ? "Определение…" : "Обновить моё местоположение"}
    </Button>
  );
}
