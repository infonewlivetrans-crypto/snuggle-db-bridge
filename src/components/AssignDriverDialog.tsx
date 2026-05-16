import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchListViaApi } from "@/lib/api-client";
import { assignDriverToRouteFn } from "@/lib/server-functions/driver-access.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Driver } from "@/lib/carriers";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  deliveryRouteId: string;
  currentDriverId?: string | null;
  currentDriverName?: string | null;
};

export function AssignDriverDialog({
  open,
  onOpenChange,
  deliveryRouteId,
  currentDriverId,
  currentDriverName,
}: Props) {
  const qc = useQueryClient();
  const [driverId, setDriverId] = useState<string>(currentDriverId ?? "");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) setDriverId(currentDriverId ?? "");
  }, [open, currentDriverId]);

  const { data: drivers, isLoading } = useQuery({
    enabled: open,
    queryKey: ["drivers", "active"],
    queryFn: async (): Promise<Driver[]> => {
      const { rows } = await fetchListViaApi<Driver>("/api/drivers", {
        limit: 500,
        extra: { activeOnly: "1" },
      });
      return rows;
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const list = drivers ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) =>
        d.full_name.toLowerCase().includes(q) ||
        (d.phone?.toLowerCase().includes(q) ?? false),
    );
  }, [drivers, search]);

  const assignFn = useServerFn(assignDriverToRouteFn);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!driverId) throw new Error("Выберите водителя");
      return await assignFn({ data: { deliveryRouteId, driverId } });
    },
    onSuccess: (res) => {
      toast.success(`Водитель назначен: ${res.fullName}`);
      qc.invalidateQueries({ queryKey: ["delivery-route", deliveryRouteId] });
      qc.invalidateQueries({ queryKey: ["delivery-routes"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isChange = !!currentDriverId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isChange ? "Сменить водителя" : "Назначить водителя"}</DialogTitle>
          <DialogDescription>
            {isChange
              ? `Текущий водитель: ${currentDriverName ?? "—"}. Выберите нового из справочника.`
              : "Выберите водителя из справочника. После назначения он увидит маршрут в своём кабинете."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="srch">Поиск</Label>
            <Input
              id="srch"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ФИО или телефон"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Водитель</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? "Загрузка…" : "Выберите водителя"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {filtered.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Ничего не найдено</div>
                ) : (
                  filtered.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.full_name}
                      {d.phone ? ` · ${d.phone}` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Только активные водители из справочника. Свободный ввод недоступен.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !driverId || driverId === currentDriverId}
          >
            {mutation.isPending ? "Сохранение…" : isChange ? "Сменить" : "Назначить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
