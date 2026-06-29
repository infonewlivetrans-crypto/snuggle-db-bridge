// Диалог создания ручной отметки проверки snapshot.
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type ReviewDecision =
  | "no_action_required"
  | "recreate_document_recommended"
  | "operator_check_required"
  | "legal_check_required"
  | "ignore_for_training";

const DECISION_LABEL: Record<ReviewDecision, string> = {
  no_action_required: "Действий не требуется",
  recreate_document_recommended: "Рекомендуется пересоздать документ",
  operator_check_required: "Нужна проверка оператора",
  legal_check_required: "Нужна юридическая проверка",
  ignore_for_training: "Игнорировать для учебного документа",
};

export function SnapshotReviewDialog({
  open, onOpenChange, onSubmit, allowAudience = false, pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (input: {
    decision: ReviewDecision;
    comment: string;
    audience?: "shared" | "dispatcher_internal";
  }) => void;
  allowAudience?: boolean;
  pending?: boolean;
}) {
  const [decision, setDecision] = useState<ReviewDecision>("no_action_required");
  const [comment, setComment] = useState("");
  const [audience, setAudience] = useState<"shared" | "dispatcher_internal">("shared");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Отметка проверки</DialogTitle>
          <DialogDescription>
            Snapshot документа фиксирует состояние экспедитора на момент создания
            и не изменяется автоматически. Отметка проверки нужна для контроля
            юридической истории.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div>
            <Label>Решение</Label>
            <Select value={decision} onValueChange={v => setDecision(v as ReviewDecision)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(DECISION_LABEL) as ReviewDecision[]).map(k => (
                  <SelectItem key={k} value={k}>{DECISION_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {allowAudience && (
            <div>
              <Label>Видимость</Label>
              <Select value={audience} onValueChange={v => setAudience(v as "shared" | "dispatcher_internal")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shared">Видно перевозчику и диспетчеру</SelectItem>
                  <SelectItem value="dispatcher_internal">Только диспетчер / админ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Комментарий</Label>
            <Textarea rows={3} value={comment} onChange={e => setComment(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button disabled={pending}
            onClick={() => onSubmit({
              decision, comment,
              audience: allowAudience ? audience : undefined,
            })}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
