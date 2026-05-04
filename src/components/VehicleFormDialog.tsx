import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost, apiPatch, fetchListViaApi } from "@/lib/api-client";
import { PhotoUpload } from "@/components/PhotoUpload";
import {
  BODY_TYPE_LABELS,
  BODY_TYPE_ORDER,
  type BodyType,
  type Carrier,
  type Vehicle,
} from "@/lib/carriers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: Vehicle | null;
  defaultCarrierId?: string;
}

export function VehicleFormDialog({ open, onOpenChange, vehicle, defaultCarrierId }: Props) {
  const qc = useQueryClient();
  const isEdit = !!vehicle;

  const [carrierId, setCarrierId] = useState<string>(vehicle?.carrier_id ?? defaultCarrierId ?? "");
  const [plate, setPlate] = useState(vehicle?.plate_number ?? "");
  const [brand, setBrand] = useState(vehicle?.brand ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [bodyType, setBodyType] = useState<BodyType>(vehicle?.body_type ?? "tent");
  const [capacity, setCapacity] = useState(vehicle?.capacity_kg?.toString() ?? "");
  const [volume, setVolume] = useState(vehicle?.volume_m3?.toString() ?? "");
  const [length, setLength] = useState(vehicle?.body_length_m?.toString() ?? "");
  const [width, setWidth] = useState(vehicle?.body_width_m?.toString() ?? "");
  const [height, setHeight] = useState(vehicle?.body_height_m?.toString() ?? "");
  const [tieRings, setTieRings] = useState(vehicle?.tie_rings_count?.toString() ?? "0");
  const [hasStraps, setHasStraps] = useState(vehicle?.has_straps ?? false);
  const [hasTent, setHasTent] = useState(vehicle?.has_tent ?? false);
  const [hasManipulator, setHasManipulator] = useState(vehicle?.has_manipulator ?? false);
  const [comment, setComment] = useState(vehicle?.comment ?? "");
  const [isActive, setIsActive] = useState(vehicle?.is_active ?? true);

  const [photoFront, setPhotoFront] = useState<string | null>(vehicle?.photo_front_url ?? null);
  const [photoBack, setPhotoBack] = useState<string | null>(vehicle?.photo_back_url ?? null);
  const [photoLeft, setPhotoLeft] = useState<string | null>(vehicle?.photo_left_url ?? null);
  const [photoRight, setPhotoRight] = useState<string | null>(vehicle?.photo_right_url ?? null);
  const [photoInside, setPhotoInside] = useState<string | null>(vehicle?.photo_inside_url ?? null);
  const [photoDocs, setPhotoDocs] = useState<string | null>(vehicle?.photo_documents_url ?? null);

  const { data: carriers } = useQuery({
    queryKey: ["carriers", "select"],
    enabled: open,
    queryFn: async (): Promise<Carrier[]> => {
      const { rows } = await fetchListViaApi<Carrier>("/api/carriers", { limit: 100 });
      return rows;
    },
  });

  const num = (s: string): number | null => {
    if (!s.trim()) return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!carrierId) throw new Error("Выберите перевозчика");
      if (!plate.trim()) throw new Error("Укажите госномер");
      const payload = {
        carrier_id: carrierId,
        plate_number: plate.trim().toUpperCase(),
        brand: brand.trim() || null,
        model: model.trim() || null,
        body_type: bodyType,
        capacity_kg: num(capacity),
        volume_m3: num(volume),
        body_length_m: num(length),
        body_width_m: num(width),
        body_height_m: num(height),
        tie_rings_count: Number(tieRings) || 0,
        has_straps: hasStraps,
        has_tent: hasTent,
        has_manipulator: hasManipulator,
        comment: comment.trim() || null,
        is_active: isActive,
        photo_front_url: photoFront,
        photo_back_url: photoBack,
        photo_left_url: photoLeft,
        photo_right_url: photoRight,
        photo_inside_url: photoInside,
        photo_documents_url: photoDocs,
      };
      if (isEdit && vehicle) {
        await apiPatch(`/api/vehicles/${vehicle.id}`, payload);
      } else {
        await apiPost(`/api/vehicles`, payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["carrier", carrierId] });
      toast.success(isEdit ? "Автомобиль обновлён" : "Автомобиль добавлен");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактирование автомобиля" : "Новый автомобиль"}</DialogTitle>
          <DialogDescription>
            Параметры кузова, оборудование и фото с 4 сторон
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Перевозчик *</Label>
              <Select value={carrierId} onValueChange={setCarrierId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Выберите перевозчика" />
                </SelectTrigger>
                <SelectContent>
                  {(carriers ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Госномер *</Label>
              <Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="А123БВ77" className="mt-1.5 font-mono uppercase" />
            </div>
            <div>
              <Label>Марка</Label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="ГАЗ" className="mt-1.5" />
            </div>
            <div>
              <Label>Модель</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Газель Next" className="mt-1.5" />
            </div>
            <div>
              <Label>Тип кузова</Label>
              <Select value={bodyType} onValueChange={(v) => setBodyType(v as BodyType)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BODY_TYPE_ORDER.map((b) => (
                    <SelectItem key={b} value={b}>
                      {BODY_TYPE_LABELS[b]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end justify-between gap-3 rounded-lg border border-border bg-secondary/40 p-3">
              <Label className="text-sm font-medium">Активен</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Параметры кузова
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <Label>Грузоподъёмность, кг</Label>
                <Input type="number" inputMode="decimal" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label>Объём, м³</Label>
                <Input type="number" inputMode="decimal" value={volume} onChange={(e) => setVolume(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label>Колец крепления</Label>
                <Input type="number" min="0" value={tieRings} onChange={(e) => setTieRings(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label>Длина, м</Label>
                <Input type="number" inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label>Ширина, м</Label>
                <Input type="number" inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label>Высота, м</Label>
                <Input type="number" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} className="mt-1.5" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Toggle label="Ремни/крепления" value={hasStraps} onChange={setHasStraps} />
              <Toggle label="Тент" value={hasTent} onChange={setHasTent} />
              <Toggle label="Манипулятор" value={hasManipulator} onChange={setHasManipulator} />
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Фото автомобиля (4 стороны + кузов внутри + документы)
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <PhotoUpload label="Спереди" value={photoFront} onChange={setPhotoFront} prefix="vehicles" />
              <PhotoUpload label="Сзади" value={photoBack} onChange={setPhotoBack} prefix="vehicles" />
              <PhotoUpload label="Слева" value={photoLeft} onChange={setPhotoLeft} prefix="vehicles" />
              <PhotoUpload label="Справа" value={photoRight} onChange={setPhotoRight} prefix="vehicles" />
              <PhotoUpload label="Кузов внутри" value={photoInside} onChange={setPhotoInside} prefix="vehicles" />
              <PhotoUpload label="Документы" value={photoDocs} onChange={setPhotoDocs} prefix="vehicles" />
            </div>
          </div>

          <div>
            <Label>Комментарий по машине</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} className="mt-1.5" rows={2} />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Сохранение…" : isEdit ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm font-medium">
      <span>{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </label>
  );
}
