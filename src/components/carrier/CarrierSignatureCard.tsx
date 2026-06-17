// Карточка статуса печати и подписи в кабинете перевозчика.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, FileSignature } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth } from "@/lib/api-client";

interface AssetRow {
  id: string;
  is_active: boolean;
}

export function CarrierSignatureCard({ carrierExtId }: { carrierExtId: string | null }) {
  const q = useQuery({
    queryKey: ["sig-assets", carrierExtId],
    enabled: !!carrierExtId,
    queryFn: () =>
      apiGetAuth<{ rows: AssetRow[] }>(
        `/api/inbound-signatures/assets?carrier_ext_id=${encodeURIComponent(carrierExtId!)}`,
        10000,
      ),
    staleTime: 30_000,
  });
  const hasActive = (q.data?.rows ?? []).some((r) => r.is_active);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSignature className="h-4 w-4" /> Печать и подпись
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {q.isLoading ? (
          <span className="inline-flex items-center text-muted-foreground">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Загрузка…
          </span>
        ) : hasActive ? (
          <>
            <Badge variant="default">Настроены</Badge>
            <p className="text-xs text-muted-foreground">
              Печать и подпись готовы — система может автоматически подписывать входящие
              договор-заявки от грузовладельцев.
            </p>
          </>
        ) : (
          <>
            <Badge variant="outline">Не настроены</Badge>
            <p className="text-xs text-muted-foreground">
              Загрузите фото или скан листа с печатью и подписью, чтобы документы от грузовладельцев
              можно было подписывать в один клик. На документе они появятся без белого прямоугольника
              от листа.
            </p>
          </>
        )}
        <Button asChild variant={hasActive ? "outline" : "default"} size="sm">
          <Link to="/carrier/signature-settings">
            {hasActive ? "Обновить образец" : "Настроить печать и подпись"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
