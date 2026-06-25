// Mock QR-блок для водителя. Реальный QR ГИС ЭПД не делаем.
// Может работать в двух режимах:
//  1) Передан documentId — компонент сам подтянет QR и зафиксирует открытие.
//  2) Переданы поля вручную (qrUid и т.п.) — рендер без сетевого запроса.
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth, apiPost } from "@/lib/api-client";

interface QrRow {
  qr_uid: string;
  qr_status: string;
  qr_generated_at: string;
  qr_cached_at: string | null;
  qr_offline_available: boolean;
  last_opened_by_driver_at: string | null;
  is_mock: boolean;
}

interface Props {
  /** Авто-режим: подтянуть QR по document_id и зафиксировать открытие. */
  documentId?: string | null;
  /** Ручной режим: готовые значения. */
  qrUid?: string | null;
  generatedAt?: string | null;
  offlineAvailable?: boolean;
}

export function DriverQrMockBlock({ documentId, qrUid, generatedAt, offlineAvailable }: Props) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["driver", "edo-qr", documentId],
    queryFn: () => apiGetAuth<{ row: QrRow | null }>(
      `/api/driver/edo/documents/${documentId}/qr`,
    ),
    enabled: Boolean(documentId),
  });
  const open = useMutation({
    mutationFn: () => apiPost(`/api/driver/edo/documents/${documentId}/qr/opened`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["driver", "edo-qr", documentId] }),
  });

  const row: QrRow | null = q.data?.row ?? null;
  const effectiveUid = row?.qr_uid ?? qrUid ?? null;
  const effectiveGenAt = row?.qr_generated_at ?? generatedAt ?? null;
  const effectiveOffline = row?.qr_offline_available ?? Boolean(offlineAvailable);

  useEffect(() => {
    if (documentId && row && !row.last_opened_by_driver_at && !open.isPending) {
      open.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, row?.qr_uid]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">QR для проверки ГИБДД</CardTitle>
          <Badge variant="outline">Тестовый QR</Badge>
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        {effectiveUid ? (
          <>
            <div className="rounded-md border bg-muted/40 p-3 flex flex-col items-center justify-center">
              <div className="font-mono text-base tracking-wider break-all text-center">
                {effectiveUid}
              </div>
              <div className="text-[10px] text-muted-foreground pt-1">QR-код будет сгенерирован графически на следующем этапе.</div>
            </div>
            <div className="text-xs">UID: <span className="font-mono">{effectiveUid}</span></div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">
            {q.isLoading ? "Загрузка QR…" : "QR ожидает формирования."}
          </div>
        )}
        {effectiveGenAt && (
          <div className="text-xs text-muted-foreground">
            Сформирован: {new Date(effectiveGenAt).toLocaleString("ru-RU")}
          </div>
        )}
        {effectiveOffline && <Badge variant="default">Доступен офлайн</Badge>}
        {row?.last_opened_by_driver_at && (
          <div className="text-xs text-emerald-700">
            Открыт водителем: {new Date(row.last_opened_by_driver_at).toLocaleString("ru-RU")}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Перед рейсом откройте QR при наличии интернета, чтобы он сохранился на устройстве.
        </p>
        <p className="text-xs text-muted-foreground">
          QR сейчас тестовый. Реальный QR/УИД появится после live-интеграции с оператором и ГИС ЭПД.
        </p>
      </CardContent>
    </Card>
  );
}
