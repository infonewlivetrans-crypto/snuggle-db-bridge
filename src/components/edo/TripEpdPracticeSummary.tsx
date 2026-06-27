// Компактная сводка ЭПД-практики (замечания + изменения) для карточки рейса/сделки.
// Не дублирует полные блоки из карточки документа: показывает счётчики и ссылки.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiGetAuth } from "@/lib/api-client";
import { AlertTriangle, FileEdit, ExternalLink } from "lucide-react";

interface Props {
  documentId: string;
  title?: string | null;
}

interface RemarkLite { id: string; severity: "info" | "warning" | "critical" }
interface ChangeLite { id: string; status: string }

export function TripEpdPracticeSummary({ documentId, title }: Props) {
  const remarksQ = useQuery({
    queryKey: ["edo", "remarks", "summary", documentId],
    queryFn: () =>
      apiGetAuth<{ rows: RemarkLite[] }>(`/api/carrier/edo/documents/${documentId}/remarks`),
  });
  const changesQ = useQuery({
    queryKey: ["edo", "changes", "summary", documentId],
    queryFn: () =>
      apiGetAuth<{ rows: ChangeLite[] }>(`/api/carrier/edo/documents/${documentId}/changes`),
  });

  const remarks = remarksQ.data?.rows ?? [];
  const critical = remarks.filter(r => r.severity === "critical").length;
  const changes = changesQ.data?.rows ?? [];
  const openChanges = changes.filter(
    c => !["completed_mock", "rejected"].includes(c.status),
  ).length;

  return (
    <div className="rounded-md border bg-muted/20 p-2 text-xs space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">Практика ЭПД</Badge>
          {title && <span className="font-medium">{title}</span>}
        </div>
        <Link to="/carrier/edo/$id" params={{ id: documentId }}>
          <Button size="sm" variant="ghost" className="h-7 gap-1">
            <ExternalLink className="h-3 w-3" /> Открыть документ
          </Button>
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={critical > 0 ? "destructive" : "secondary"} className="gap-1">
          <AlertTriangle className="h-3 w-3" /> Замечаний: {remarks.length}
          {critical > 0 ? ` · крит ${critical}` : ""}
        </Badge>
        <Badge variant={openChanges > 0 ? "default" : "secondary"} className="gap-1">
          <FileEdit className="h-3 w-3" /> Изменений: {changes.length}
          {openChanges > 0 ? ` · в работе ${openChanges}` : ""}
        </Badge>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Изменение водителя, транспорта или точки выгрузки может потребовать дополнительного титула у оператора ЭДО.
      </p>
    </div>
  );
}
