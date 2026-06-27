// Mock QR-блок для водителя. Графический QR через локальную библиотеку 'qrcode'.
// Реальный ГИС ЭПД здесь не используется.
import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth, apiPost } from "@/lib/api-client";
import { QrCodeMockVisual } from "./QrCodeMockVisual";

interface QrRow {
  qr_uid: string;
  qr_payload?: unknown;
  qr_status: string;
  qr_generated_at: string;
  qr_cached_at: string | null;
  qr_offline_available: boolean;
  last_opened_by_driver_at: string | null;
  is_mock: boolean;
}

interface Props {
  documentId?: string | null;
  qrUid?: string | null;
  generatedAt?: string | null;
  offlineAvailable?: boolean;
  /** Произвольная метка рейса/документа для подписи под QR. */
  tripLabel?: string | null;
}

export function DriverQrMockBlock({
  documentId, qrUid, generatedAt, offlineAvailable, tripLabel,
}: Props) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["driver", "edo-qr", documentId],
    queryFn: () => apiGetAuth<{ row: QrRow | null }>(
      `/api/driver/edo/documents/${documentId}/qr`,
    ),
    enabled: Boolean(documentId),
  });
  const open = useMutation({
    mutationFn: () => apiPost(`/api/driver/edo/documents/${documentId}/qr`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["driver", "edo-qr", documentId] }),
  });

  const row: QrRow | null = q.data?.row ?? null;
  const effectiveUid = row?.qr_uid ?? qrUid ?? null;
  const effectiveGenAt = row?.qr_generated_at ?? generatedAt ?? null;
  const effectiveOffline = row?.qr_offline_available ?? Boolean(offlineAvailable);
  const status = row?.qr_status ?? "mock";

  const qrValue = useMemo(() => {
    if (row?.qr_payload) {
      try { return JSON.stringify(row.qr_payload); } catch { /* noop */ }
    }
    return effectiveUid ?? "";
  }, [row?.qr_payload, effectiveUid]);

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
        {effectiveUid && qrValue ? (
          <>
            <div className="flex flex-col items-center gap-2 rounded-md border bg-white p-3">
              <QrCodeMockVisual value={qrValue} size={220} />
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                MOCK — тестовый QR
              </div>
            </div>
            <div className="text-xs">
              УИД: <span className="font-mono break-all">{effectiveUid}</span>
            </div>
            {tripLabel && (
              <div className="text-xs text-muted-foreground">Рейс/документ: {tripLabel}</div>
            )}
            <div className="text-xs text-muted-foreground">Статус: {status}</div>
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
          Перед рейсом откройте QR при наличии интернета — он сохранится на устройстве и будет доступен офлайн.
        </p>
        <p className="text-xs text-muted-foreground">
          Это тестовый QR. Реальный QR/УИД появится после регистрации ЭПД у оператора и в ГИС ЭПД.
        </p>
      </CardContent>
    </Card>
  );
}
