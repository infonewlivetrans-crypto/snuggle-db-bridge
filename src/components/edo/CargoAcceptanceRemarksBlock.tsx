// Замечания при приёмке груза (этап Т2 ЭТрН).
// Mock/dev — реальная отправка титулов будет на следующем этапе.
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
import { apiGetAuth, apiPost, apiDelete } from "@/lib/api-client";
import { toast } from "sonner";
import {
  REMARK_TYPES, REMARK_TYPE_LABEL,
  type RemarkType, type RemarkSeverity,
} from "@/server/edo/remarks.server";

const SEVERITY_LABEL: Record<RemarkSeverity, string> = {
  info: "Информационно",
  warning: "Предупреждение",
  critical: "Критично",
};

interface AttachmentMeta {
  name: string;
  size: number;
  type: string;
  preview_data_url?: string;
  is_mock: true;
}

interface RemarkRow {
  id: string;
  remark_type: RemarkType;
  remark_text: string | null;
  severity: RemarkSeverity;
  quantity_expected: number | null;
  quantity_actual: number | null;
  weight_expected: number | null;
  weight_actual: number | null;
  attachments_json: AttachmentMeta[] | unknown;
  is_training: boolean;
  created_at: string;
}

interface Props {
  documentId: string;
  /** Подсвечивает учебный режим, передавать из документа. */
  isTraining?: boolean;
  /** Только просмотр (например, для водителя). */
  readOnly?: boolean;
}

export function CargoAcceptanceRemarksBlock({ documentId, isTraining, readOnly }: Props) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["edo", "remarks", documentId],
    queryFn: () => apiGetAuth<{ rows: RemarkRow[] }>(
      `/api/carrier/edo/documents/${documentId}/remarks`,
    ),
  });

  const [type, setType] = useState<RemarkType>("cargo_damaged");
  const [severity, setSeverity] = useState<RemarkSeverity>("warning");
  const [text, setText] = useState("");
  const [qExp, setQExp] = useState("");
  const [qAct, setQAct] = useState("");
  const [wExp, setWExp] = useState("");
  const [wAct, setWAct] = useState("");
  const [photos, setPhotos] = useState<AttachmentMeta[]>([]);

  async function onPickFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const added: AttachmentMeta[] = [];
    for (const f of Array.from(files).slice(0, 6)) {
      const isImg = f.type.startsWith("image/");
      let preview: string | undefined;
      if (isImg && f.size <= 512 * 1024) {
        preview = await new Promise<string | undefined>(resolve => {
          const r = new FileReader();
          r.onload = () => resolve(typeof r.result === "string" ? r.result : undefined);
          r.onerror = () => resolve(undefined);
          r.readAsDataURL(f);
        });
      }
      added.push({ name: f.name, size: f.size, type: f.type, preview_data_url: preview, is_mock: true });
    }
    setPhotos(prev => [...prev, ...added]);
  }

  const create = useMutation({
    mutationFn: () => apiPost(`/api/carrier/edo/documents/${documentId}/remarks`, {
      remark_type: type,
      severity,
      remark_text: text || null,
      quantity_expected: qExp ? Number(qExp) : null,
      quantity_actual: qAct ? Number(qAct) : null,
      weight_expected: wExp ? Number(wExp) : null,
      weight_actual: wAct ? Number(wAct) : null,
      attachments_json: photos,
      is_training: Boolean(isTraining),
    }),
    onSuccess: () => {
      toast.success("Замечание сохранено");
      setText(""); setQExp(""); setQAct(""); setWExp(""); setWAct(""); setPhotos([]);
      qc.invalidateQueries({ queryKey: ["edo", "remarks", documentId] });
      qc.invalidateQueries({ queryKey: ["edo", "doc", documentId] });
    },
    onError: e => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/carrier/edo/documents/${documentId}/remarks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["edo", "remarks", documentId] });
      qc.invalidateQueries({ queryKey: ["edo", "doc", documentId] });
    },
    onError: e => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const rows = q.data?.rows ?? [];
  const criticalCount = rows.filter(r => r.severity === "critical").length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Замечания при приёмке груза</CardTitle>
          <div className="flex items-center gap-2">
            {isTraining && <Badge variant="outline">Учебный документ</Badge>}
            {criticalCount > 0 && <Badge variant="destructive">Критичных: {criticalCount}</Badge>}
            <Badge variant="secondary">Всего: {rows.length}</Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Если при погрузке есть расхождения, повреждения или проблемы с состоянием груза,
          зафиксируйте это до подписания этапа Т2. Иначе потом будет не видно состояние груза при приёмке.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {rows.length === 0 ? (
          <div className="text-xs text-muted-foreground">Замечаний пока нет.</div>
        ) : (
          <div className="space-y-1.5">
            {rows.map(r => (
              <div key={r.id} className="rounded-md border p-2 flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={r.severity === "critical" ? "destructive"
                        : r.severity === "warning" ? "default" : "outline"}
                    >
                      {SEVERITY_LABEL[r.severity]}
                    </Badge>
                    <span className="font-medium">{REMARK_TYPE_LABEL[r.remark_type] ?? r.remark_type}</span>
                    {r.is_training && <Badge variant="outline" className="text-xs">учебное</Badge>}
                  </div>
                  {r.remark_text && <div className="text-xs">{r.remark_text}</div>}
                  {(r.quantity_expected != null || r.quantity_actual != null) && (
                    <div className="text-xs text-muted-foreground">
                      Кол-во: {r.quantity_expected ?? "—"} / факт {r.quantity_actual ?? "—"}
                    </div>
                  )}
                  {(r.weight_expected != null || r.weight_actual != null) && (
                    <div className="text-xs text-muted-foreground">
                      Вес: {r.weight_expected ?? "—"} / факт {r.weight_actual ?? "—"}
                    </div>
                  )}
                  {Array.isArray(r.attachments_json) && r.attachments_json.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(r.attachments_json as AttachmentMeta[]).map((a, i) => (
                        <div key={i} className="border rounded p-1 bg-background text-[10px]">
                          {a.preview_data_url ? (
                            <img src={a.preview_data_url} alt={a.name}
                              className="h-12 w-12 object-cover rounded" />
                          ) : (
                            <div className="h-12 w-12 flex items-center justify-center bg-muted rounded">
                              📎
                            </div>
                          )}
                          <div className="max-w-[80px] truncate" title={a.name}>{a.name}</div>
                          <Badge variant="outline" className="text-[9px] px-1 py-0">mock</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("ru-RU")}
                  </div>
                </div>
                {!readOnly && (
                  <Button size="sm" variant="ghost"
                    onClick={() => remove.mutate(r.id)}
                    disabled={remove.isPending}>
                    Удалить
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {!readOnly && (
          <div className="rounded-md border p-2 space-y-2 bg-muted/30">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label>Тип замечания</Label>
                <Select value={type} onValueChange={v => setType(v as RemarkType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REMARK_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{REMARK_TYPE_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Серьёзность</Label>
                <Select value={severity} onValueChange={v => setSeverity(v as RemarkSeverity)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Информационно</SelectItem>
                    <SelectItem value="warning">Предупреждение</SelectItem>
                    <SelectItem value="critical">Критично</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Кол-во ожидаемое</Label>
                <Input value={qExp} onChange={e => setQExp(e.target.value)} inputMode="decimal" />
              </div>
              <div>
                <Label>Кол-во фактическое</Label>
                <Input value={qAct} onChange={e => setQAct(e.target.value)} inputMode="decimal" />
              </div>
              <div>
                <Label>Вес ожидаемый</Label>
                <Input value={wExp} onChange={e => setWExp(e.target.value)} inputMode="decimal" />
              </div>
              <div>
                <Label>Вес фактический</Label>
                <Input value={wAct} onChange={e => setWAct(e.target.value)} inputMode="decimal" />
              </div>
            </div>
            <div>
              <Label>Комментарий</Label>
              <Textarea value={text} onChange={e => setText(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Фото / вложения</Label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={e => onPickFiles(e.target.files)}
                className="block text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Фото помогает подтвердить состояние груза при приёмке и может пригодиться при споре.
                Загрузка фото пока выполняется в mock-режиме (без storage) — будет подключена через storage на следующем этапе.
              </p>
              {photos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {photos.map((p, i) => (
                    <div key={i} className="border rounded p-1 bg-background text-[10px] relative">
                      {p.preview_data_url ? (
                        <img src={p.preview_data_url} alt={p.name}
                          className="h-14 w-14 object-cover rounded" />
                      ) : (
                        <div className="h-14 w-14 flex items-center justify-center bg-muted rounded">📎</div>
                      )}
                      <div className="max-w-[80px] truncate" title={p.name}>{p.name}</div>
                      <button
                        type="button"
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full h-5 w-5 text-xs"
                        onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
              Добавить замечание
            </Button>
          </div>
        )}

        {criticalCount > 0 && (
          <div className="text-xs text-destructive">
            Есть критичные замечания. Перед mock-отправкой проверьте, нужно ли поднимать вопрос с грузоотправителем.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
