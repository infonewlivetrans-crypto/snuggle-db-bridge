// Mock QR-блок для водителя. Реальный QR ГИС ЭПД не делаем.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
  qrUid?: string | null;
  generatedAt?: string | null;
  offlineAvailable?: boolean;
}

export function DriverQrMockBlock({ qrUid, generatedAt, offlineAvailable }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">QR для проверки</CardTitle>
          <Badge variant="outline">Тестовый QR — без подключения к ГИС ЭПД</Badge>
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        {qrUid
          ? <div>UID: <span className="font-mono text-xs">{qrUid}</span></div>
          : <div className="text-muted-foreground">QR ожидает формирования.</div>
        }
        {generatedAt && <div className="text-xs text-muted-foreground">Сформирован: {new Date(generatedAt).toLocaleString("ru-RU")}</div>}
        {offlineAvailable && <div className="text-xs text-emerald-700">QR доступен офлайн.</div>}
        <p className="text-xs text-muted-foreground">
          Откройте перед рейсом, чтобы сохранить QR на устройстве.
        </p>
      </CardContent>
    </Card>
  );
}
