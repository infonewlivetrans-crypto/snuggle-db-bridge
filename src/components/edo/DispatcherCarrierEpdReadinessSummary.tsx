// Read-only сводка готовности перевозчика к ЭПД для диспетчера.
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiGetAuth } from "@/lib/api-client";
import { toast } from "sonner";

interface Row {
  edo_operator: string | null;
  has_1c: boolean;
  has_1c_edo: boolean;
  has_1c_epd: boolean;
  has_director_kep: boolean;
  has_mchd: boolean;
  driver_has_smartphone: boolean;
  driver_qr_ready: boolean;
  readiness_status: string;
  last_checked_at: string | null;
  notes: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  not_ready: "Не готов",
  in_progress: "В работе",
  ready: "Готов",
  partial: "Частично готов",
};

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between text-xs gap-2">
      <span className="text-muted-foreground">{label}</span>
      <Badge variant={on ? "default" : "outline"}>{on ? "Да" : "—"}</Badge>
    </div>
  );
}

interface Props {
  carrierExtId: string;
}

export function DispatcherCarrierEpdReadinessSummary({ carrierExtId }: Props) {
  const q = useQuery({
    queryKey: ["dispatcher", "epd-readiness", carrierExtId],
    queryFn: () => apiGetAuth<{ row: Row | null }>(
      `/api/dispatcher/carriers/${carrierExtId}/epd-readiness`,
    ),
  });

  const row = q.data?.row ?? null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Готовность перевозчика к ЭПД</CardTitle>
          {row && <Badge variant={row.readiness_status === "ready" ? "default" : "outline"}>
            {STATUS_LABEL[row.readiness_status] ?? row.readiness_status}
          </Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          Диспетчер видит, кто из перевозчиков может работать с ЭПД, а кому нужна настройка.
        </p>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        {q.isLoading && <div className="text-xs text-muted-foreground">Загрузка…</div>}
        {!q.isLoading && !row && (
          <div className="text-xs text-muted-foreground">
            Перевозчик не заполнил анкету готовности к ЭПД.
          </div>
        )}
        {row && (
          <>
            <div className="text-xs">Оператор ЭДО/ЭПД: <b>{row.edo_operator ?? "—"}</b></div>
            <div className="space-y-1">
              <Flag on={row.has_1c} label="Используется 1С" />
              <Flag on={row.has_1c_edo} label="Подключён 1С-ЭДО" />
              <Flag on={row.has_1c_epd} label="Подключён 1С-ЭПД" />
              <Flag on={row.has_director_kep} label="Есть КЭП руководителя" />
              <Flag on={row.has_mchd} label="Есть МЧД" />
              <Flag on={row.driver_has_smartphone} label="Смартфон у водителя" />
              <Flag on={row.driver_qr_ready} label="Водитель готов открывать QR" />
            </div>
            {row.last_checked_at && (
              <div className="text-xs text-muted-foreground">
                Последняя проверка: {new Date(row.last_checked_at).toLocaleString("ru-RU")}
              </div>
            )}
            {row.notes && <div className="text-xs">Комментарий: {row.notes}</div>}
          </>
        )}
        <div className="pt-1">
          <Button size="sm" variant="outline"
            onClick={() => toast.info("Запрос отправлен перевозчику (mock)")}>
            Запросить данные у перевозчика
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
