// /dispatcher/inbound-documents — список входящих заявок от грузовладельцев.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, FileText, RefreshCw, Ban, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { DispatcherShell } from "@/components/dispatcher/DispatcherShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiGetAuth, apiPost } from "@/lib/api-client";

export const Route = createFileRoute("/dispatcher/inbound-documents")({
  head: () => ({ meta: [{ title: "Входящие заявки — AI Диспетчер" }] }),
  component: InboundDocumentsListPage,
});

interface Row {
  id: string;
  carrier_ext_id: string;
  email_from: string | null;
  email_subject: string | null;
  email_date: string | null;
  attachment_filename: string | null;
  document_kind: string | null;
  processing_status: string;
  parse_confidence: number | null;
  dispatcher_trip_id: string | null;
  dispatcher_deal_id: string | null;
  dispatcher_freight_id: string | null;
  created_at: string;
}

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  new: { label: "Новое", variant: "secondary" },
  saved: { label: "Сохранено", variant: "secondary" },
  parsing: { label: "Разбор…", variant: "secondary" },
  parsed: { label: "Разобрано", variant: "default" },
  needs_review: { label: "На проверку", variant: "outline" },
  linked: { label: "В рейсе", variant: "default" },
  failed: { label: "Ошибка", variant: "destructive" },
  ignored: { label: "Игнор", variant: "secondary" },
};

function InboundDocumentsListPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["dispatcher", "inbound-documents"],
    queryFn: () => apiGetAuth<{ rows: Row[] }>("/api/dispatcher/inbound-documents", 15000),
    staleTime: 10_000,
  });

  const parseMut = useMutation({
    mutationFn: (id: string) => apiPost(`/api/dispatcher/inbound-documents/${id}/parse`, {}, 60_000),
    onSuccess: () => {
      toast.success("Документ разобран");
      qc.invalidateQueries({ queryKey: ["dispatcher", "inbound-documents"] });
    },
    onError: () => toast.error("Не удалось разобрать документ"),
  });
  const ignoreMut = useMutation({
    mutationFn: (id: string) => apiPost(`/api/dispatcher/inbound-documents/${id}/ignore`, {}),
    onSuccess: () => {
      toast.success("Документ помечен как игнор");
      qc.invalidateQueries({ queryKey: ["dispatcher", "inbound-documents"] });
    },
    onError: () => toast.error("Не удалось обновить статус"),
  });

  return (
    <DispatcherShell>
      <div className="space-y-4 p-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Входящие заявки</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
              </div>
            ) : (data?.rows ?? []).length === 0 ? (
              <div className="rounded border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                Пока нет входящих документов.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-2 py-2 text-left">Дата</th>
                      <th className="px-2 py-2 text-left">Отправитель</th>
                      <th className="px-2 py-2 text-left">Тема</th>
                      <th className="px-2 py-2 text-left">Файл</th>
                      <th className="px-2 py-2 text-left">Статус</th>
                      <th className="px-2 py-2 text-left">Рейс</th>
                      <th className="px-2 py-2 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.rows ?? []).map((r) => {
                      const st = STATUS[r.processing_status] ?? {
                        label: r.processing_status,
                        variant: "secondary" as const,
                      };
                      return (
                        <tr key={r.id} className="border-b border-border/50">
                          <td className="px-2 py-2 align-top">
                            {r.email_date ? new Date(r.email_date).toLocaleString("ru-RU") : "—"}
                          </td>
                          <td className="px-2 py-2 align-top">{r.email_from ?? "—"}</td>
                          <td className="px-2 py-2 align-top">{r.email_subject ?? "—"}</td>
                          <td className="px-2 py-2 align-top">
                            <span className="inline-flex items-center gap-1">
                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                              {r.attachment_filename ?? "—"}
                            </span>
                          </td>
                          <td className="px-2 py-2 align-top">
                            <Badge variant={st.variant}>{st.label}</Badge>
                          </td>
                          <td className="px-2 py-2 align-top">
                            {r.dispatcher_trip_id ? (
                              <span className="text-xs text-muted-foreground">
                                {r.dispatcher_trip_id.slice(0, 8)}…
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-2 py-2 align-top">
                            <div className="flex flex-wrap justify-end gap-1">
                              <Button asChild size="sm" variant="outline">
                                <Link
                                  to="/dispatcher/inbound-documents/$id"
                                  params={{ id: r.id }}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Link>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => parseMut.mutate(r.id)}
                                disabled={parseMut.isPending}
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => ignoreMut.mutate(r.id)}
                                disabled={ignoreMut.isPending}
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DispatcherShell>
  );
}
