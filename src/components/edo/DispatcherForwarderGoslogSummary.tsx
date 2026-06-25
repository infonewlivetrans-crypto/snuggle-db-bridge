// Read-only сводка ГосЛог экспедитора для диспетчера.
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth } from "@/lib/api-client";

interface Row {
  inn: string | null;
  ogrn: string | null;
  company_name: string | null;
  okved_codes: string[] | unknown;
  has_okved_5229: boolean;
  goslog_status: string;
  registry_number: string | null;
  application_number: string | null;
  application_date: string | null;
  included_at: string | null;
  source_url: string | null;
  verified_at: string | null;
  verification_comment: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  unknown: "Не проверен",
  verified: "ГосЛог ✓",
  pending: "Заявление подано",
  not_found: "Не найден",
  error: "Ошибка проверки",
};

interface Props {
  forwarderId: string;
}

export function DispatcherForwarderGoslogSummary({ forwarderId }: Props) {
  const q = useQuery({
    queryKey: ["dispatcher", "forwarder-goslog", forwarderId],
    queryFn: () => apiGetAuth<{ row: Row | null }>(
      `/api/dispatcher/forwarders/${forwarderId}/goslog-status`,
    ),
  });

  const row = q.data?.row ?? null;
  const isVerified = row?.goslog_status === "verified";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">ГосЛог экспедитора</CardTitle>
          {row && (
            <Badge variant={isVerified ? "default" : "outline"}>
              {STATUS_LABEL[row.goslog_status] ?? row.goslog_status}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        {q.isLoading && <div className="text-xs text-muted-foreground">Загрузка…</div>}
        {!q.isLoading && !row && (
          <div className="text-xs text-muted-foreground">
            Сведения ГосЛог для этого экспедитора не зафиксированы.
          </div>
        )}
        {row && (
          <>
            {row.company_name && <div>{row.company_name}</div>}
            {row.inn && <div className="text-xs">ИНН: {row.inn}</div>}
            {row.ogrn && <div className="text-xs">ОГРН: {row.ogrn}</div>}
            <div className="text-xs">
              ОКВЭД 52.29: <Badge variant={row.has_okved_5229 ? "default" : "outline"}>
                {row.has_okved_5229 ? "присутствует" : "нет"}
              </Badge>
            </div>
            {row.application_number && (
              <div className="text-xs">Номер заявления: {row.application_number}</div>
            )}
            {row.registry_number && (
              <div className="text-xs">Номер записи: {row.registry_number}</div>
            )}
            {row.included_at && (
              <div className="text-xs">Включён: {row.included_at}</div>
            )}
            {row.verified_at && (
              <div className="text-xs text-muted-foreground">
                Проверено: {new Date(row.verified_at).toLocaleString("ru-RU")}
              </div>
            )}
            {row.source_url && (
              <div className="text-xs">Источник: <a className="underline" href={row.source_url} target="_blank" rel="noreferrer">{row.source_url}</a></div>
            )}
            {row.verification_comment && (
              <div className="text-xs">{row.verification_comment}</div>
            )}
          </>
        )}
        {row && !isVerified && (
          <div className="text-xs text-amber-700 pt-1">
            Экспедитор не подтверждён в ГосЛог. Перед рабочим сценарием ЭПД проверьте официальный источник.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
