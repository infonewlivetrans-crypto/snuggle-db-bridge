import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Truck, AlertTriangle, Save } from "lucide-react";
import { toast } from "sonner";
import type { BodyType } from "@/lib/carriers";

const NONE = "__none__";

// Типы транспорта для заявок (по ТЗ)
const REQUEST_BODY_TYPES: { value: BodyType; label: string }[] = [
  { value: "gazelle", label: "Газель" },
  { value: "tent", label: "Тент" },
  { value: "sideboard", label: "Борт" },
  { value: "closed_van", label: "Фура" },
  { value: "manipulator", label: "Манипулятор" },
  { value: "long_vehicle", label: "Длинномер" },
];

export type TransportRequirements = {
  required_body_type: BodyType | null;
  required_capacity_kg: number | null;
  required_volume_m3: number | null;
  required_body_length_m: number | null;
  requires_tent: boolean;
  requires_manipulator: boolean;
  requires_straps: boolean;
  transport_comment: string | null;
};

export function TransportRequirementsBlock({
  requestId,
  initial,
}: {
  requestId: string;
  initial: TransportRequirements;
}) {
  const queryClient = useQueryClient();

  const [bodyType, setBodyType] = useState<string>(initial.required_body_type ?? NONE);
  const [capacity, setCapacity] = useState<string>(
    initial.required_capacity_kg != null ? String(initial.required_capacity_kg) : "",
  );
  const [volume, setVolume] = useState<string>(
    initial.required_volume_m3 != null ? String(initial.required_volume_m3) : "",
  );
  const [length, setLength] = useState<string>(
    initial.required_body_length_m != null ? String(initial.required_body_length_m) : "",
  );
  const [needTent, setNeedTent] = useState<boolean>(initial.requires_tent);
  const [needManip, setNeedManip] = useState<boolean>(initial.requires_manipulator);
  const [needStraps, setNeedStraps] = useState<boolean>(initial.requires_straps);
  const [comment, setComment] = useState<string>(initial.transport_comment ?? "");

  useEffect(() => {
    setBodyType(initial.required_body_type ?? NONE);
    setCapacity(initial.required_capacity_kg != null ? String(initial.required_capacity_kg) : "");
    setVolume(initial.required_volume_m3 != null ? String(initial.required_volume_m3) : "");
    setLength(initial.required_body_length_m != null ? String(initial.required_body_length_m) : "");
    setNeedTent(initial.requires_tent);
    setNeedManip(initial.requires_manipulator);
    setNeedStraps(initial.requires_straps);
    setComment(initial.transport_comment ?? "");
  }, [
    initial.required_body_type,
    initial.required_capacity_kg,
    initial.required_volume_m3,
    initial.required_body_length_m,
    initial.requires_tent,
    initial.requires_manipulator,
    initial.requires_straps,
    initial.transport_comment,
  ]);

  const isEmpty =
    !initial.required_body_type &&
    !initial.required_capacity_kg &&
    !initial.required_volume_m3 &&
    !initial.required_body_length_m &&
    !initial.requires_tent &&
    !initial.requires_manipulator &&
    !initial.requires_straps &&
    !initial.transport_comment;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        required_body_type: bodyType === NONE ? null : (bodyType as BodyType),
        required_capacity_kg: capacity === "" ? null : Number(capacity),
        required_volume_m3: volume === "" ? null : Number(volume),
        required_body_length_m: length === "" ? null : Number(length),
        requires_tent: needTent,
        requires_manipulator: needManip,
        requires_straps: needStraps,
        transport_comment: comment.trim() === "" ? null : comment.trim(),
      };
      const { error } = await supabase.from("routes").update(payload).eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transport-request", requestId] });
      toast.success("Требования к транспорту сохранены");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Truck className="h-3.5 w-3.5" />
        Требования к транспорту
      </div>

      {isEmpty && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          Не указаны требования к транспорту
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Тип транспорта
          </label>
          <Select value={bodyType} onValueChange={setBodyType}>
            <SelectTrigger>
              <SelectValue placeholder="Не выбран" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— не выбран —</SelectItem>
              {REQUEST_BODY_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Мин. грузоподъёмность, кг
          </label>
          <Input
            type="number"
            min="0"
            step="1"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="например, 1500"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Мин. объём кузова, м³
          </label>
          <Input
            type="number"
            min="0"
            step="0.1"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            placeholder="например, 16"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Мин. длина кузова, м
          </label>
          <Input
            type="number"
            min="0"
            step="0.1"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            placeholder="например, 4.2"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 pt-1">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <Checkbox checked={needTent} onCheckedChange={(v) => setNeedTent(v === true)} />
          Нужен тент
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <Checkbox checked={needManip} onCheckedChange={(v) => setNeedManip(v === true)} />
          Нужен манипулятор
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <Checkbox checked={needStraps} onCheckedChange={(v) => setNeedStraps(v === true)} />
          Нужны крепления / ремни
        </label>
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted-foreground">
          Комментарий логиста по транспорту
        </label>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Особые условия загрузки, габариты, требования к водителю..."
          rows={3}
        />
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="gap-1.5"
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Сохранение..." : "Сохранить требования"}
        </Button>
      </div>
    </div>
  );
}
