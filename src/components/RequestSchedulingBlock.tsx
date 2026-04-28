import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar as CalendarIcon, Clock, AlertTriangle, Flag } from "lucide-react";
import { toast } from "sonner";
import {
  PRIORITY_LABELS,
  PRIORITY_BADGE_CLASS,
  PRIORITY_ORDER,
  type RequestPriority,
} from "@/lib/requestPriority";

type Props = {
  requestId: string;
  routeDate: string | null;
  departureTime: string | null;
  priority: RequestPriority;
};

export function RequestSchedulingBlock({
  requestId,
  routeDate,
  departureTime,
  priority,
}: Props) {
  const qc = useQueryClient();
  const [date, setDate] = useState(routeDate ?? "");
  const [time, setTime] = useState(departureTime ? departureTime.slice(0, 5) : "");
  const [pr, setPr] = useState<RequestPriority>(priority);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("routes")
        .update({
          route_date: date || null,
          departure_time: time ? `${time}:00` : null,
          request_priority: pr,
        })
        .eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("План отправки сохранён");
      qc.invalidateQueries({ queryKey: ["transport-request", requestId] });
      qc.invalidateQueries({ queryKey: ["transport-requests"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Не удалось сохранить"),
  });

  const noTime = !date || !time;

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">Планирование отправки</div>
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE_CLASS[pr]}`}
        >
          <Flag className="h-3 w-3" />
          {PRIORITY_LABELS[pr]}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <CalendarIcon className="h-3.5 w-3.5" />
            Дата отправки
          </label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Время отправки
          </label>
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Flag className="h-3.5 w-3.5" />
            Приоритет
          </label>
          <Select value={pr} onValueChange={(v) => setPr(v as RequestPriority)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_ORDER.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {noTime && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Не указано время отправки
        </div>
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          {save.isPending ? "Сохранение..." : "Сохранить"}
        </Button>
      </div>
    </div>
  );
}
