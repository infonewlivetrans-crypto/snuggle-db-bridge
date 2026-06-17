// Блок «Входящие документы по рейсам» в кабинете перевозчика.
// Показывает последние полученные по почте файлы и кнопку «Проверить почту».
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, Mail, RefreshCw, FileText } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiGetAuth, apiPost } from "@/lib/api-client";

interface DocRow {
  id: string;
  email_from: string | null;
  email_subject: string | null;
  email_date: string | null;
  attachment_filename: string | null;
  document_kind: string | null;
  processing_status: string;
  dispatcher_trip_id: string | null;
  created_at: string;
}

interface EmailAcc {
  row: { has_password: boolean; has_imap_password?: boolean; imap_host?: string | null } | null;
}

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  new: { label: "Новое", variant: "secondary" },
  saved: { label: "Сохранено", variant: "secondary" },
  parsing: { label: "Разбор…", variant: "secondary" },
  parsed: { label: "Разобрано", variant: "default" },
  needs_review: { label: "Проверка", variant: "outline" },
  linked: { label: "Прикреплено к рейсу", variant: "default" },
  failed: { label: "Ошибка", variant: "destructive" },
  ignored: { label: "Игнор", variant: "secondary" },
};

export function CarrierInboundDocsBlock() {
  const qc = useQueryClient();
  const acc = useQuery({
    queryKey: ["carrier", "email-account"],
    queryFn: () => apiGetAuth<EmailAcc>("/api/carrier/email-account", 10000),
    staleTime: 30_000,
  });
  const list = useQuery({
    queryKey: ["carrier", "inbound-documents"],
    queryFn: () => apiGetAuth<{ rows: DocRow[] }>("/api/carrier/inbound-documents", 10000),
    staleTime: 15_000,
  });

  const syncMut = useMutation({
    mutationFn: () =>
      apiPost<{ ok: boolean; imported?: number; parsed?: number; needsReview?: number; message?: string }>(
        "/api/carrier/inbound-documents/sync",
        {},
        60_000,
      ),
    onSuccess: (r) => {
      if (!r.ok) toast.error(r.message ?? "Не удалось проверить почту");
      else
        toast.success(
          `Проверка завершена. Новых: ${r.imported ?? 0}, на проверку: ${r.needsReview ?? 0}`,
        );
      qc.invalidateQueries({ queryKey: ["carrier", "inbound-documents"] });
    },
    onError: () => toast.error("Не удалось подключиться к почте"),
  });

  const hasImap = !!acc.data?.row?.has_imap_password || !!acc.data?.row?.imap_host;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Входящие документы по рейсам
          </span>
          {hasImap && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending}
            >
              {syncMut.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-4 w-4" />
              )}
              Проверить почту
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {!hasImap && (
          <div className="flex flex-col gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <div>
              Чтобы получать подписанные заявки автоматически, подключите почту перевозчика.
            </div>
            <Button asChild size="sm">
              <Link to="/carrier/email-settings">Настроить почту</Link>
            </Button>
          </div>
        )}
        {list.isLoading ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
          </div>
        ) : (list.data?.rows ?? []).length === 0 ? (
          <div className="rounded border border-border bg-muted/30 p-3 text-muted-foreground">
            Пока нет входящих документов.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(list.data?.rows ?? []).map((d) => {
              const st = STATUS[d.processing_status] ?? { label: d.processing_status, variant: "secondary" as const };
              return (
                <li key={d.id} className="flex items-start gap-2 py-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {d.attachment_filename || d.email_subject || "Без названия"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {d.email_from ?? "—"} · {d.email_date ? new Date(d.email_date).toLocaleString("ru-RU") : "—"}
                    </div>
                  </div>
                  <Badge variant={st.variant} className="shrink-0">
                    {st.label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
