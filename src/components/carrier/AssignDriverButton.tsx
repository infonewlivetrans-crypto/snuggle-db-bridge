import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGetAuth, apiPatch } from "@/lib/api-client";
import { Link } from "@tanstack/react-router";

type DriverOption = { id: string; full_name: string | null };

interface Props {
  vehicleId: string;
  currentDriverId: string | null;
  currentDriverName?: string | null;
}

export function AssignDriverButton({ vehicleId, currentDriverId, currentDriverName }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(currentDriverId ?? "__none");

  const driversQ = useQuery({
    queryKey: ["carrier", "drivers", "select"],
    queryFn: () =>
      apiGetAuth<{ rows: DriverOption[] }>("/api/carrier/drivers", 10000),
    enabled: open,
  });

  const mut = useMutation({
    mutationFn: async (driverId: string | null) => {
      await apiPatch(`/api/carrier/vehicles/${vehicleId}`, {
        dispatcher_driver_ext_id: driverId,
        assigned_driver_ext_id: driverId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carrier", "vehicles"] });
      toast.success("Водитель обновлён");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось обновить водителя"),
  });

  const drivers = driversQ.data?.rows ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {currentDriverId ? (
          <>
            <Button size="sm" variant="outline" onClick={() => { setValue(currentDriverId); setOpen(true); }}>
              <UserCheck className="mr-1 h-3 w-3" /> Сменить водителя
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => mut.mutate(null)}
              disabled={mut.isPending}
            >
              <UserX className="mr-1 h-3 w-3" /> Снять
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => { setValue("__none"); setOpen(true); }}>
            <UserPlus className="mr-1 h-3 w-3" /> Закрепить водителя
          </Button>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Закрепить водителя</DialogTitle>
            <DialogDescription>
              Выберите водителя вашей компании, который будет ездить на этой машине.
              Один водитель может быть на нескольких машинах.
            </DialogDescription>
          </DialogHeader>
          {drivers.length === 0 && !driversQ.isLoading ? (
            <div className="rounded-md border p-3 text-sm">
              <div className="mb-2">У вас пока нет водителей.</div>
              <Button asChild size="sm">
                <Link to="/carrier/drivers">Добавить водителя</Link>
              </Button>
            </div>
          ) : (
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger>
                <SelectValue placeholder="Без водителя" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— без водителя —</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.full_name ?? d.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {currentDriverName && (
            <p className="text-xs text-muted-foreground">
              Сейчас: {currentDriverName}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button
              onClick={() => mut.mutate(value === "__none" ? null : value)}
              disabled={mut.isPending || drivers.length === 0}
            >
              {mut.isPending ? "Сохранение…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
