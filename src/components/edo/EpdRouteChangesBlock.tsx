// Изменения по ЭПД — mock дополнительных титулов / изменений по рейсу.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiGetAuth, apiPost, apiPatch } from "@/lib/api-client";
import { toast } from "sonner";
import {
  CHANGE_TYPES, CHANGE_TYPE_LABEL, CHANGE_STATUS_LABEL,
  type ChangeType, type ChangeStatus,
} from "@/server/edo/changes.server";

interface ChangeRow {
  id: string;
  change_type: ChangeType;
  old_value_json: unknown;
  new_value_json: unknown;
  reason: string | null;
  status: ChangeStatus;
  approved_at: string | null;
  operator_status: string | null;
  saby_action_hint: string | null;
  is_training: boolean;
  created_at: string;
}

interface Props {
  documentId: string;
  isTraining?: boolean;
}

const STATUS_VARIANT: Record<ChangeStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  requested: "secondary",
  approved: "default",
  rejected: "destructive",
  sent_to_operator_mock: "secondary",
  completed_mock: "default",
  failed_mock: "destructive",
};

export function EpdRouteChangesBlock({ documentId, isTraining }: Props) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["edo", "changes", documentId],
    queryFn: () => apiGetAuth<{ rows: ChangeRow[] }>(
      `/api/carrier/edo/documents/${documentId}/changes`,
    ),
  });

  const [type, setType] = useState<ChangeType>("driver_change");
  const [oldVal, setOldVal] = useState("");
  const [newVal, setNewVal] = useState("");
  const [reason, setReason] = useState("");

  const create = useMutation({
    mutationFn: () => apiPost(`/api/carrier/edo/documents/${documentId}/changes`, {
      change_type: type,
      old_value_json: { value: oldVal || null },
      new_value_json: { value: newVal || null },
      reason: reason || null,
      status: "draft",
      is_training: Boolean(isTraining),
      saby_action_hint: type === "driver_change" || type === "vehicle_change"
        ? "Возможно потребуется доп. титул Т1+ у оператора" : null,
    }),
    onSuccess: () => {
      toast.success("Изменение зафиксировано");
      setOldVal(""); setNewVal(""); setReason("");
      qc.invalidateQueries({ queryKey: ["edo", "changes", documentId] });
      qc.invalidateQueries({ queryKey: ["edo", "doc", documentId] });
    },
    onError: e => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const patch = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ChangeStatus }) =>
      apiPatch(`/api/carrier/edo/documents/${documentId}/changes/${id}`, { status }),
    onSuccess: () => {
      toast.success("Статус обновлён");
      qc.invalidateQueries({ queryKey: ["edo", "changes", documentId] });
    },
    onError: e => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const rows = q.data?.rows ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Изменения по ЭПД</CardTitle>
          <Badge variant="secondary">Всего: {rows.length}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Если после оформления документа меняется водитель, транспорт, точка выгрузки
          или условия перевозки, изменение должно быть зафиксировано в истории ЭПД.
        </p>
        <p className="text-xs text-amber-700">
          Это dev/mock фиксация изменения. Реальная отправка оператору будет на следующем этапе.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {rows.length === 0 ? (
          <div className="text-xs text-muted-foreground">Изменений по рейсу пока нет.</div>
        ) : (
          <div className="space-y-1.5">
            {rows.map(r => (
              <div key={r.id} className="rounded-md border p-2 space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{CHANGE_TYPE_LABEL[r.change_type] ?? r.change_type}</span>
                    <Badge variant={STATUS_VARIANT[r.status]}>{CHANGE_STATUS_LABEL[r.status]}</Badge>
                    {r.is_training && <Badge variant="outline" className="text-xs">учебное</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("ru-RU")}
                  </span>
                </div>
                {r.reason && <div className="text-xs">{r.reason}</div>}
                <div className="text-xs text-muted-foreground">
                  Было: <code>{JSON.stringify(r.old_value_json)}</code> →
                  Стало: <code>{JSON.stringify(r.new_value_json)}</code>
                </div>
                {r.saby_action_hint && (
                  <div className="text-xs text-amber-700">Подсказка: {r.saby_action_hint}</div>
                )}
                {r.operator_status && (
                  <div className="text-xs">Оператор (mock): {r.operator_status}</div>
                )}
                <div className="flex flex-wrap gap-1 pt-1">
                  {r.status === "draft" && (
                    <Button size="sm" variant="outline"
                      onClick={() => patch.mutate({ id: r.id, status: "requested" })}>Запросить</Button>
                  )}
                  {r.status === "requested" && (
                    <>
                      <Button size="sm" onClick={() => patch.mutate({ id: r.id, status: "approved" })}>Согласовать</Button>
                      <Button size="sm" variant="destructive"
                        onClick={() => patch.mutate({ id: r.id, status: "rejected" })}>Отклонить</Button>
                    </>
                  )}
                  {r.status === "approved" && (
                    <Button size="sm" variant="outline"
                      onClick={() => patch.mutate({ id: r.id, status: "sent_to_operator_mock" })}>
                      Отправить оператору (mock)
                    </Button>
                  )}
                  {r.status === "sent_to_operator_mock" && (
                    <>
                      <Button size="sm" onClick={() => patch.mutate({ id: r.id, status: "completed_mock" })}>
                        Отметить как выполненное (mock)
                      </Button>
                      <Button size="sm" variant="destructive"
                        onClick={() => patch.mutate({ id: r.id, status: "failed_mock" })}>
                        Ошибка (mock)
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-md border p-2 space-y-2 bg-muted/30">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label>Тип изменения</Label>
              <Select value={type} onValueChange={v => setType(v as ChangeType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANGE_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{CHANGE_TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Причина</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div>
              <Label>Было</Label>
              <Textarea value={oldVal} onChange={e => setOldVal(e.target.value)} rows={2} />
            </div>
            <div>
              <Label>Стало</Label>
              <Textarea value={newVal} onChange={e => setNewVal(e.target.value)} rows={2} />
            </div>
          </div>
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
            Добавить изменение
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
