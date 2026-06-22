import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth, apiPost } from "@/lib/api-client";
import { toast } from "sonner";
import {
  EDO_DOC_STATUS_LABEL, edoDocStatusVariant, edoAwaitingLabel,
  EDO_PARTICIPANT_LABEL, EDO_PROVIDER_LABEL,
  type EdoDocStatus, type EdoParticipantRole, type EdoProvider,
} from "@/lib/edo/constants";
import { ArrowLeft, CheckCircle2, X, RefreshCcw, Send, ClipboardCheck } from "lucide-react";

export const Route = createFileRoute("/carrier/edo/$id")({
  head: () => ({ meta: [{ title: "Документ ЭТрН — Радиус Трек" }] }),
  component: CarrierEdoDocPage,
});

interface DocFull {
  document: {
    id: string;
    doc_number: string | null;
    status: EdoDocStatus;
    provider: EdoProvider;
    direction: "incoming" | "outgoing" | "internal" | null;
    document_type: string | null;
    title: string | null;
    route_summary: string | null;
    shipper_name: string | null;
    shipper_inn: string | null;
    consignee_name: string | null;
    consignee_inn: string | null;
    vehicle_label: string | null;
    driver_label: string | null;
    cargo_summary: string | null;
    loading_at: string | null;
    unloading_at: string | null;
    rate_amount: number | null;
    awaiting_role: EdoParticipantRole | null;
    external_id: string | null;
    operator_document_id: string | null;
    operator_status: string | null;
    sent_at: string | null;
    delivered_at: string | null;
    signed_at: string | null;
    rejected_at: string | null;
    error_message: string | null;
    payload_json: Record<string, unknown> | null;
    meta: Record<string, unknown> | null;
    trip_id: string | null;
    freight_id: string | null;
    created_at: string;
  };
  participants: Array<{
    id: string; role: EdoParticipantRole; name: string | null; inn: string | null;
    participant_operator_provider: EdoProvider | null;
    participant_signature_status: string;
    participant_sign_method: string | null;
    signed_at: string | null;
    error_message: string | null;
  }>;
  events: Array<{
    id: string; event_type: string; message: string | null;
    actor_role: EdoParticipantRole | null; created_at: string;
  }>;
}

function CarrierEdoDocPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["edo", "doc", id],
    queryFn: () => apiGetAuth<DocFull>(`/api/carrier/edo/documents/${id}`),
  });

  const act = useMutation({
    mutationFn: ({ op, body }: { op: string; body?: unknown }) =>
      apiPost(`/api/carrier/edo/documents/${id}/actions?op=${op}`, body ?? {}),
    onSuccess: () => { toast.success("Готово"); qc.invalidateQueries({ queryKey: ["edo", "doc", id] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  if (q.isLoading) return <div className="text-sm text-muted-foreground">Загрузка…</div>;
  if (!q.data) return <div className="text-sm text-muted-foreground">Документ не найден</div>;

  const { document: d, participants, events } = q.data;

  return (
    <div className="space-y-4">
      <Link to="/carrier/edo" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Назад к списку
      </Link>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">
              {d.doc_number ?? `ЭТрН ${d.id.slice(0, 8)}`}
            </CardTitle>
            <Badge variant={edoDocStatusVariant(d.status)}>{EDO_DOC_STATUS_LABEL[d.status]}</Badge>
          </div>
          {d.awaiting_role && (
            <p className="text-sm text-amber-700 mt-1">{edoAwaitingLabel(d.awaiting_role)}</p>
          )}
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div><span className="text-muted-foreground">Оператор:</span> {EDO_PROVIDER_LABEL[d.provider]}</div>
          {d.route_summary && <div><span className="text-muted-foreground">Маршрут:</span> {d.route_summary}</div>}
          {d.cargo_summary && <div><span className="text-muted-foreground">Груз:</span> {d.cargo_summary}</div>}
          {d.vehicle_label && <div><span className="text-muted-foreground">Машина:</span> {d.vehicle_label}</div>}
          {d.driver_label && <div><span className="text-muted-foreground">Водитель:</span> {d.driver_label}</div>}
          {d.rate_amount != null && <div><span className="text-muted-foreground">Ставка:</span> {d.rate_amount} ₽</div>}
          {d.external_id && <div className="text-xs text-muted-foreground">Внешний ID: {d.external_id}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Действия</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => act.mutate({ op: "sign-carrier" })}
            disabled={act.isPending || d.status === "closed" || d.status === "cancelled"}>
            <CheckCircle2 className="h-4 w-4 mr-1.5" />Подписать как перевозчик
          </Button>
          <Button size="sm" variant="outline" onClick={() => act.mutate({ op: "driver-action", body: { action: "confirm" } })}>
            Подтвердить действие водителя
          </Button>
          <Button size="sm" variant="outline" onClick={() => act.mutate({ op: "mock-shipper-sign" })}>
            Mock: подпись грузоотправителя
          </Button>
          <Button size="sm" variant="outline" onClick={() => act.mutate({ op: "mock-consignee-sign" })}>
            Mock: подпись грузополучателя
          </Button>
          <Button size="sm" variant="outline" onClick={() => act.mutate({ op: "sync" })}>
            <RefreshCcw className="h-4 w-4 mr-1.5" />Обновить статус
          </Button>
          <Button size="sm" variant="outline" onClick={() => act.mutate({ op: "close" })}>Закрыть</Button>
          <Button size="sm" variant="destructive" onClick={() => act.mutate({ op: "cancel", body: { reason: "carrier" } })}>
            <X className="h-4 w-4 mr-1.5" />Отменить
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Участники</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {participants.map(p => (
            <div key={p.id} className="rounded-md border p-2.5 text-sm">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-medium">{EDO_PARTICIPANT_LABEL[p.role]}</div>
                <Badge variant={p.participant_signature_status === "signed" ? "default" : "outline"}>
                  {p.participant_signature_status === "signed" ? "Подписано" : "Ожидает"}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {p.name ?? "—"}{p.inn ? ` · ИНН ${p.inn}` : ""}
                {p.participant_operator_provider ? ` · ${EDO_PROVIDER_LABEL[p.participant_operator_provider]}` : ""}
                {p.signed_at ? ` · ${new Date(p.signed_at).toLocaleString("ru-RU")}` : ""}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">История</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {events.length === 0 ? (
            <div className="text-sm text-muted-foreground">Событий пока нет.</div>
          ) : events.map(e => (
            <div key={e.id} className="text-xs flex items-start gap-2 border-b border-border/40 pb-1.5 last:border-0">
              <span className="text-muted-foreground shrink-0 w-32">
                {new Date(e.created_at).toLocaleString("ru-RU")}
              </span>
              <span className="font-medium shrink-0">{e.event_type}</span>
              <span className="text-muted-foreground">{e.message ?? ""}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
