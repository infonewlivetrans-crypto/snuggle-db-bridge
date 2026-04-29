import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Camera, Loader2 } from "lucide-react";

const ROUTE_POINT_PHOTOS_BUCKET = "route-point-photos";

// Быстрые шаблоны проблем для водителя (по ТЗ)
const QUICK_TEMPLATES: { reason: string; comment: string }[] = [
  { reason: "Нужен звонок менеджера", comment: "Прошу менеджера срочно связаться со мной по точке." },
  { reason: "Клиент просит перенести доставку", comment: "Клиент просит перенести доставку — нужен новый слот." },
  { reason: "Клиент спорит по оплате", comment: "У клиента вопросы / спор по сумме оплаты." },
  { reason: "Клиент не принимает товар", comment: "Клиент отказывается принимать товар на месте." },
  { reason: "Нужен возврат на склад", comment: "Не могу выгрузить — нужен возврат на склад." },
  { reason: "Нужна замена товара", comment: "Клиент просит замену — текущий товар не подходит / повреждён." },
];

const REASONS = [
  "Нужен звонок менеджера",
  "Клиент просит перенести доставку",
  "Клиент спорит по оплате",
  "Клиент не принимает товар",
  "Нужен возврат на склад",
  "Нужна замена товара",
  "Клиент отказывается принимать",
  "Нет оплаты",
  "Нет QR-кода",
  "Клиент не отвечает",
  "Клиента нет на месте",
  "Брак / повреждение",
  "Нет возможности выгрузки",
  "Проблема с адресом",
  "ДТП / поломка машины",
  "Другое",
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  orderNumber: string;
  routePointId?: string | null;
  routeId?: string | null;
  reportedBy?: string | null;
  managerName?: string | null;
  managerPhone?: string | null;
}

export function ReportProblemDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  routePointId,
  routeId,
  reportedBy,
  managerName,
  managerPhone,
}: Props) {
  const qc = useQueryClient();
  const [reason, setReason] = useState<string>("");
  const [comment, setComment] = useState("");
  const [urgency, setUrgency] = useState<"normal" | "urgent">("normal");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setReason("");
    setComment("");
    setUrgency("normal");
    setPhotoFile(null);
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!reason) throw new Error("Выберите причину проблемы.");
      let photo_url: string | null = null;
      if (photoFile) {
        setUploading(true);
        const ext = photoFile.name.split(".").pop() || "jpg";
        const path = `problem-reports/${orderId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(ROUTE_POINT_PHOTOS_BUCKET)
          .upload(path, photoFile, { upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage
          .from(ROUTE_POINT_PHOTOS_BUCKET)
          .getPublicUrl(path);
        photo_url = pub.publicUrl;
        setUploading(false);
      }
      const { error } = await supabase.from("order_problem_reports").insert({
        order_id: orderId,
        route_point_id: routePointId ?? null,
        route_id: routeId ?? null,
        reason,
        comment: comment.trim() || null,
        photo_url,
        urgency,
        reported_by: reportedBy ?? null,
        manager_name: managerName ?? null,
        manager_phone: managerPhone ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Проблема отправлена менеджеру.");
      qc.invalidateQueries({ queryKey: ["order-problem-reports", orderId] });
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => {
      setUploading(false);
      toast.error(e.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Сообщить менеджеру о проблеме
          </DialogTitle>
          <DialogDescription>
            Заказ №{orderNumber}
            {managerName ? ` · Менеджер: ${managerName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Причина проблемы *
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Выберите причину" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Комментарий
            </Label>
            <Textarea
              className="mt-1.5"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Опишите подробнее"
            />
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Фото
            </Label>
            <Input
              type="file"
              accept="image/*"
              capture="environment"
              className="mt-1.5"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            />
            {photoFile && (
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Camera className="h-3 w-3" /> {photoFile.name}
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Срочность
            </Label>
            <Select value={urgency} onValueChange={(v) => setUrgency(v as "normal" | "urgent")}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Обычная</SelectItem>
                <SelectItem value="urgent">Срочная</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
            Отмена
          </Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={submit.isPending || uploading || !reason}
            className="gap-1.5"
          >
            {(submit.isPending || uploading) && <Loader2 className="h-4 w-4 animate-spin" />}
            Отправить менеджеру
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
