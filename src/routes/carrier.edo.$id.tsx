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
    saby_document_id: string | null;
    saby_attachment_id: string | null;
    saby_flk_errors: Record<string, unknown> | null;
    participant_links: Record<string, string | null> | null;
    signing_mode: string | null;
    integration_mode: string | null;
    export_to_1c_status: string | null;
    exported_to_1c_at: string | null;
    export_to_1c_error: string | null;
    external_1c_id: string | null;
    onec_exchange_direction: string | null;
    last_synced_at: string | null;
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
          <div><span className="text-muted-foreground">Тип:</span> {d.document_type ?? "—"}</div>
          <div><span className="text-muted-foreground">Направление:</span> {d.direction ?? "—"}</div>
          <div><span className="text-muted-foreground">Оператор:</span> {EDO_PROVIDER_LABEL[d.provider]}</div>
          {d.route_summary && <div><span className="text-muted-foreground">Маршрут:</span> {d.route_summary}</div>}
          {d.cargo_summary && <div><span className="text-muted-foreground">Груз:</span> {d.cargo_summary}</div>}
          {d.vehicle_label && <div><span className="text-muted-foreground">Машина:</span> {d.vehicle_label}</div>}
          {d.driver_label && <div><span className="text-muted-foreground">Водитель:</span> {d.driver_label}</div>}
          {d.shipper_name && <div><span className="text-muted-foreground">Грузоотправитель:</span> {d.shipper_name}{d.shipper_inn ? ` · ИНН ${d.shipper_inn}` : ""}</div>}
          {d.consignee_name && <div><span className="text-muted-foreground">Грузополучатель:</span> {d.consignee_name}{d.consignee_inn ? ` · ИНН ${d.consignee_inn}` : ""}</div>}
          {d.rate_amount != null && <div><span className="text-muted-foreground">Ставка:</span> {d.rate_amount} ₽</div>}
          {d.operator_document_id && <div><span className="text-muted-foreground">ID у оператора:</span> {d.operator_document_id}</div>}
          {d.operator_status && <div><span className="text-muted-foreground">Статус оператора:</span> {d.operator_status}</div>}
          {d.sent_at && <div><span className="text-muted-foreground">Отправлен:</span> {new Date(d.sent_at).toLocaleString("ru-RU")}</div>}
          {d.delivered_at && <div><span className="text-muted-foreground">Доставлен:</span> {new Date(d.delivered_at).toLocaleString("ru-RU")}</div>}
          {d.signed_at && <div><span className="text-muted-foreground">Подписан:</span> {new Date(d.signed_at).toLocaleString("ru-RU")}</div>}
          {d.rejected_at && <div><span className="text-muted-foreground">Отклонён:</span> {new Date(d.rejected_at).toLocaleString("ru-RU")}</div>}
          {d.error_message && <div className="text-destructive">Ошибка: {d.error_message}</div>}
          {d.external_id && <div className="text-xs text-muted-foreground">Внешний ID: {d.external_id}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Отправка оператору</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                const r = await apiPost<{ ok: boolean; missing?: string[]; error?: string }>(
                  `/api/carrier/edo/documents/${id}/prepare`, {},
                );
                if (r.ok) {
                  toast.success("Документ готов к отправке");
                  qc.invalidateQueries({ queryKey: ["edo", "doc", id] });
                } else {
                  toast.error("Не хватает данных", {
                    description: (r.missing ?? []).join("\n") || r.error,
                  });
                }
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Ошибка");
              }
            }}
          >
            <ClipboardCheck className="h-4 w-4 mr-1.5" />Подготовить к отправке
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              try {
                const r = await apiPost<{ ok: boolean; error?: string }>(
                  `/api/carrier/edo/documents/${id}/send`, {},
                );
                if (r.ok) toast.success("Документ отправлен оператору");
                else toast.error(r.error ?? "Не удалось отправить");
                qc.invalidateQueries({ queryKey: ["edo", "doc", id] });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Ошибка");
              }
            }}
            disabled={d.status !== "ready_to_send" && d.status !== "error"}
          >
            <Send className="h-4 w-4 mr-1.5" />Отправить оператору
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                const r = await apiGetAuth<{ ok: boolean; operator_status?: string | null; error?: string }>(
                  `/api/carrier/edo/documents/${id}/status`,
                );
                if (r.ok) toast.success(`Статус: ${r.operator_status ?? "—"}`);
                else toast.error(r.error ?? "Ошибка");
                qc.invalidateQueries({ queryKey: ["edo", "doc", id] });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Ошибка");
              }
            }}
          >
            <RefreshCcw className="h-4 w-4 mr-1.5" />Обновить статус
          </Button>
        </CardContent>
      </Card>

      <SabyAnd1cBlock id={id} d={d} qc={qc} />


      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Подписание и закрытие</CardTitle></CardHeader>
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
          <Button size="sm" variant="outline" onClick={() => act.mutate({ op: "close" })}>Закрыть</Button>
          <Button size="sm" variant="destructive" onClick={() => act.mutate({ op: "cancel", body: { reason: "carrier" } })}>
            <X className="h-4 w-4 mr-1.5" />Отменить
          </Button>
        </CardContent>
      </Card>

      {d.payload_json && Object.keys(d.payload_json).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Payload (без секретов)</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap break-all bg-muted/40 rounded-md p-2">
              {JSON.stringify(d.payload_json, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

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

const PARTICIPANT_LINK_LABELS: Record<string, string> = {
  sender_link: "Отправителю",
  shipper_link: "Грузоотправителю",
  carrier_link: "Перевозчику",
  driver_link: "Водителю",
  consignee_link: "Грузополучателю",
  forwarder_link: "Экспедитору",
  customer_link: "Заказчику",
};

function SabyAnd1cBlock({
  id, d, qc,
}: {
  id: string;
  d: DocFull["document"];
  qc: ReturnType<typeof useQueryClient>;
}) {
  const refresh = () => qc.invalidateQueries({ queryKey: ["edo", "doc", id] });
  const isSaby = d.provider === "saby_tms";
  const links = d.participant_links ?? {};

  async function call(url: string, method: "POST" | "GET" = "POST") {
    try {
      const r = method === "GET"
        ? await apiGetAuth<{ ok: boolean; error?: string }>(url)
        : await apiPost<{ ok: boolean; error?: string; missing?: string[] }>(url, {});
      if (r.ok) toast.success("Готово");
      else toast.error(r.error ?? "Ошибка", {
        description: (r as { missing?: string[] }).missing?.join("\n"),
      });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Saby TMS</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="text-xs text-muted-foreground">
            Оператор: {EDO_PROVIDER_LABEL[d.provider]}
            {d.integration_mode ? ` · режим ${d.integration_mode}` : ""}
            {d.signing_mode ? ` · подпись ${d.signing_mode}` : ""}
          </div>
          {d.saby_document_id && <div>Saby ID документа: {d.saby_document_id}</div>}
          {d.saby_attachment_id && <div>Saby ID вложения: {d.saby_attachment_id}</div>}
          {d.last_synced_at && (
            <div className="text-xs text-muted-foreground">
              Последняя синхронизация: {new Date(d.last_synced_at).toLocaleString("ru-RU")}
            </div>
          )}
          {d.saby_flk_errors && Object.keys(d.saby_flk_errors).length > 0 && (
            <div className="text-destructive text-xs">
              Ошибки ФЛК: {JSON.stringify(d.saby_flk_errors)}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" disabled={!isSaby}
              onClick={() => call(`/api/carrier/edo/documents/${id}/saby/prepare`)}>
              Подготовить (Saby)
            </Button>
            <Button size="sm" variant="outline" disabled={!isSaby}
              onClick={() => call(`/api/carrier/edo/documents/${id}/saby/send`)}>
              Отправить в Saby
            </Button>
            <Button size="sm" variant="outline" disabled={!isSaby}
              onClick={() => call(`/api/carrier/edo/documents/${id}/saby/status`, "GET")}>
              Обновить статус Saby
            </Button>
            <Button size="sm" variant="outline" disabled={!isSaby}
              onClick={() => call(`/api/carrier/edo/documents/${id}/saby/generate-links`)}>
              Сгенерировать ссылки
            </Button>
          </div>
          {!isSaby && (
            <p className="text-xs text-muted-foreground">
              Действия Saby доступны для документов с оператором Saby TMS.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ссылки участникам</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1.5">
          {Object.keys(links).length === 0 ? (
            <div className="text-muted-foreground">Ссылки ещё не сгенерированы.</div>
          ) : (
            Object.entries(links).map(([k, v]) => v ? (
              <div key={k} className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs">
                  <span className="text-muted-foreground">{PARTICIPANT_LINK_LABELS[k] ?? k}: </span>
                  <span className="break-all">{v}</span>
                </div>
                <Button size="sm" variant="ghost"
                  onClick={() => {
                    void navigator.clipboard.writeText(v);
                    toast.success("Ссылка скопирована");
                  }}>
                  Скопировать
                </Button>
              </div>
            ) : null)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Выгрузка в 1С</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div>
            <span className="text-muted-foreground">Статус:</span> {d.export_to_1c_status ?? "—"}
          </div>
          {d.exported_to_1c_at && (
            <div className="text-xs text-muted-foreground">
              Выгружен: {new Date(d.exported_to_1c_at).toLocaleString("ru-RU")}
            </div>
          )}
          {d.external_1c_id && <div className="text-xs">ID в 1С: {d.external_1c_id}</div>}
          {d.onec_exchange_direction && (
            <div className="text-xs text-muted-foreground">
              Направление обмена: {d.onec_exchange_direction}
            </div>
          )}
          {d.export_to_1c_error && (
            <div className="text-xs text-destructive">Ошибка: {d.export_to_1c_error}</div>
          )}
          <div className="pt-1">
            <Button size="sm" variant="outline"
              onClick={() => call(`/api/carrier/edo/documents/${id}/export-1c`)}>
              Поставить на выгрузку в 1С
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
