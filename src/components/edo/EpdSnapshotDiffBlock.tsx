// Блок «Проверка актуальности данных» в карточке ЭПД-документа перевозчика.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth, apiPost } from "@/lib/api-client";
import { Link } from "@tanstack/react-router";
import { SnapshotDiffBadge, type SnapshotRiskLevel } from "./SnapshotDiffBadge";
import { SnapshotReviewDialog } from "./SnapshotReviewDialog";

interface Diff {
  document_id: string;
  forwarder_id: string | null;
  has_snapshot: boolean;
  snapshot: Record<string, unknown> | null;
  current_snapshot: Record<string, unknown> | null;
  current_forwarder_status: string | null;
  diffs: Array<{
    field: string; label: string;
    snapshot_value: unknown; current_value: unknown;
    diff_type: string; risk: SnapshotRiskLevel;
  }>;
  diff_types: string[];
  risk_level: SnapshotRiskLevel;
  checked_at: string;
}

interface Review {
  id: string; decision: string; comment: string | null;
  checked_at: string; audience: string;
}

interface Resp { diff: Diff; summary: { level: SnapshotRiskLevel; text: string }; reviews: Review[] }

function fmtValue(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.length === 0 ? "—" : v.join(", ");
  if (typeof v === "boolean") return v ? "да" : "нет";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const DECISION_LABEL: Record<string, string> = {
  no_action_required: "Действий не требуется",
  recreate_document_recommended: "Рекомендуется пересоздать документ",
  operator_check_required: "Нужна проверка оператора",
  legal_check_required: "Нужна юридическая проверка",
  ignore_for_training: "Игнорировать для учебного документа",
};

export function EpdSnapshotDiffBlock({ documentId }: { documentId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["edo", "doc", documentId, "snapshot-diff"],
    queryFn: () => apiGetAuth<Resp>(`/api/carrier/edo/documents/${documentId}/snapshot-diff`),
  });
  const [showSnap, setShowSnap] = useState(false);
  const [showCur, setShowCur] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const review = useMutation({
    mutationFn: (body: { decision: string; comment: string }) =>
      apiPost(`/api/carrier/edo/documents/${documentId}/snapshot-review`, body),
    onSuccess: () => {
      toast.success("Отметка сохранена");
      setReviewOpen(false);
      qc.invalidateQueries({ queryKey: ["edo", "doc", documentId, "snapshot-diff"] });
    },
    onError: e => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const data = q.data;
  const diff = data?.diff;
  const fwd = useMemo(
    () => (diff?.snapshot ?? null) as Record<string, unknown> | null,
    [diff],
  );
  const cur = (diff?.current_snapshot ?? null) as Record<string, unknown> | null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Проверка актуальности данных</CardTitle>
          {data?.summary && <SnapshotDiffBadge level={data.summary.level} text={data.summary.text} />}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Документ хранит snapshot участника на момент создания. Если данные экспедитора
          изменились позже, система показывает отличия, но не меняет историю документа автоматически.
        </p>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        {q.isLoading && <div className="text-xs text-muted-foreground">Загрузка…</div>}
        {!q.isLoading && diff && (
          <>
            <div className="grid gap-1 sm:grid-cols-2 text-xs">
              <div className="rounded-md border p-2">
                <div className="text-muted-foreground mb-1">На момент документа</div>
                <div>Экспедитор: {fmtValue(fwd?.forwarder_name)}</div>
                <div>ИНН: {fmtValue(fwd?.forwarder_inn)}</div>
                <div>ГосЛог: <Badge variant="outline">{fmtValue(fwd?.goslog_status)}</Badge></div>
                <div>ОКВЭД 52.29: {fmtValue(fwd?.has_okved_5229)}</div>
                <div>Режим участия: {fmtValue(fwd?.forwarder_possession_mode)}</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-muted-foreground mb-1">Сейчас в справочнике</div>
                <div>Экспедитор: {fmtValue(cur?.forwarder_name)}</div>
                <div>ИНН: {fmtValue(cur?.forwarder_inn)}</div>
                <div>ГосЛог: <Badge variant="outline">{fmtValue(cur?.goslog_status)}</Badge></div>
                <div>ОКВЭД 52.29: {fmtValue(cur?.has_okved_5229)}</div>
                <div>Режим участия: {fmtValue(cur?.forwarder_possession_mode)}</div>
                {diff.current_forwarder_status && (
                  <div>Статус: <Badge variant="outline">{diff.current_forwarder_status}</Badge></div>
                )}
              </div>
            </div>

            {diff.diffs.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Отличий не найдено. Snapshot документа совпадает с текущими данными.
              </p>
            ) : (
              <div className="space-y-1">
                <div className="text-xs font-medium">Отличия:</div>
                {diff.diffs.map((d, i) => (
                  <div key={i} className="rounded-md border p-2 text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">{d.label}</span>
                      <Badge variant={d.risk === "critical" ? "destructive"
                        : d.risk === "warning" ? "secondary" : "outline"}>
                        {d.risk}
                      </Badge>
                      <span className="text-muted-foreground">· {d.diff_type}</span>
                    </div>
                    <div className="text-muted-foreground">
                      Было: <span className="text-foreground">{fmtValue(d.snapshot_value)}</span>
                      {" → "}
                      Сейчас: <span className="text-foreground">{fmtValue(d.current_value)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Snapshot — это снимок данных на момент создания документа. Он нужен,
              чтобы сохранить историю оформления. Если статус ГосЛог изменился,
              старый документ не меняется автоматически. Критическое отличие
              не означает автоматическую ошибку, но требует ручной проверки
              перед отправкой оператору. Для учебных документов отличия можно
              игнорировать, но они всё равно показываются для обучения.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline"
                onClick={() => qc.invalidateQueries({ queryKey: ["edo", "doc", documentId, "snapshot-diff"] })}>
                Обновить проверку
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowSnap(v => !v)}>
                {showSnap ? "Скрыть snapshot" : "Показать snapshot"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowCur(v => !v)}>
                {showCur ? "Скрыть текущие данные" : "Показать текущие данные"}
              </Button>
              <Button size="sm" onClick={() => setReviewOpen(true)}>Создать отметку проверки</Button>
              {diff.forwarder_id && (
                <Button size="sm" variant="outline" asChild>
                  <Link to="/dispatcher/forwarders">Открыть экспедитора</Link>
                </Button>
              )}
              {diff.risk_level !== "info" && (
                <Button size="sm" variant="ghost" disabled
                  title="Будет добавлено на следующем этапе">
                  Создать новую версию документа
                </Button>
              )}
            </div>

            {showSnap && (
              <pre className="text-xs whitespace-pre-wrap break-all bg-muted/40 rounded-md p-2">
                {JSON.stringify(fwd, null, 2)}
              </pre>
            )}
            {showCur && (
              <pre className="text-xs whitespace-pre-wrap break-all bg-muted/40 rounded-md p-2">
                {JSON.stringify(cur, null, 2)}
              </pre>
            )}

            {data && data.reviews.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium">Отметки проверки:</div>
                {data.reviews.map(r => (
                  <div key={r.id} className="text-xs rounded-md border p-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline">{DECISION_LABEL[r.decision] ?? r.decision}</Badge>
                      <span className="text-muted-foreground">
                        {new Date(r.checked_at).toLocaleString("ru-RU")}
                      </span>
                    </div>
                    {r.comment && <div className="mt-0.5">{r.comment}</div>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <SnapshotReviewDialog
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          pending={review.isPending}
          onSubmit={({ decision, comment }) =>
            review.mutate({ decision, comment })}
        />
      </CardContent>
    </Card>
  );
}
