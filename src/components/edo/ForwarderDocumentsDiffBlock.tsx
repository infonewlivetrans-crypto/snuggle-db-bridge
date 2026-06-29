// Блок «Документы с отличиями» в карточке экспедитора у диспетчера.
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { apiGetAuth } from "@/lib/api-client";
import { SnapshotDiffBadge, type SnapshotRiskLevel } from "./SnapshotDiffBadge";

interface Row {
  document_id: string;
  scenario_id: string | null;
  scenario_type: string | null;
  document_status: string | null;
  document_title: string | null;
  is_training: boolean;
  trip_id: string | null;
  created_at: string;
  snapshot_goslog: string | null;
  current_goslog: string | null;
  snapshot_okved_5229: boolean | null;
  current_okved_5229: boolean | null;
  diff_types: string[];
  risk_level: SnapshotRiskLevel;
  has_diff: boolean;
  has_snapshot: boolean;
}

export function ForwarderDocumentsDiffBlock({ forwarderId }: { forwarderId: string }) {
  const q = useQuery({
    queryKey: ["dispatcher", "forwarders-ext", forwarderId, "documents-with-diffs"],
    queryFn: () => apiGetAuth<{ rows: Row[] }>(
      `/api/dispatcher/forwarders-ext/${forwarderId}/documents-with-diffs`,
    ),
  });
  const rows = q.data?.rows ?? [];
  const withDiff = rows.filter(r => r.has_diff);
  const critical = withDiff.filter(r => r.risk_level === "critical").length;
  const warnings = withDiff.filter(r => r.risk_level === "warning").length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Документы с отличиями</CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-2">
        {q.isLoading && <div className="text-muted-foreground">Загрузка…</div>}
        {!q.isLoading && rows.length === 0 && (
          <div className="text-muted-foreground">
            Связанных ЭПД-документов пока нет.
          </div>
        )}
        {!q.isLoading && rows.length > 0 && withDiff.length === 0 && (
          <div className="text-muted-foreground">
            Отличий между текущими данными и snapshot документов не найдено.
          </div>
        )}
        {(critical > 0 || warnings > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {critical > 0 && (
              <Badge variant="destructive">Есть документы с критическими отличиями: {critical}</Badge>
            )}
            {warnings > 0 && (
              <Badge variant="secondary">Требуется ручная проверка: {warnings}</Badge>
            )}
          </div>
        )}
        {withDiff.map(r => (
          <div key={r.document_id} className="rounded-md border p-2 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <SnapshotDiffBadge level={r.risk_level} />
              {r.scenario_type && <Badge variant="outline">{r.scenario_type}</Badge>}
              {r.is_training && <Badge variant="secondary">Учебный</Badge>}
              {!r.has_snapshot && <Badge variant="outline">Без snapshot</Badge>}
              {r.document_status && <Badge variant="outline">{r.document_status}</Badge>}
            </div>
            <div className="text-muted-foreground">
              {r.document_title ?? "(без названия)"}
              {" · "}{new Date(r.created_at).toLocaleString("ru-RU")}
            </div>
            <div className="text-muted-foreground">
              ГосЛог: <span className="text-foreground">{r.snapshot_goslog ?? "—"}</span>
              {" → "}<span className="text-foreground">{r.current_goslog ?? "—"}</span>
              {" · "}ОКВЭД 52.29: <span className="text-foreground">{
                r.snapshot_okved_5229 == null ? "—" : (r.snapshot_okved_5229 ? "да" : "нет")
              }</span>
              {" → "}<span className="text-foreground">{
                r.current_okved_5229 == null ? "—" : (r.current_okved_5229 ? "да" : "нет")
              }</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {r.diff_types.filter(t => t !== "no_diff").map(t => (
                <Badge key={t} variant="outline">{t}</Badge>
              ))}
            </div>
            <div>
              <Button size="sm" variant="outline" asChild>
                <Link to="/carrier/edo/$id" params={{ id: r.document_id }}>
                  Открыть документ
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
