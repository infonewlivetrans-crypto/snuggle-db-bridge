// /carrier/signature-settings — настройка печати и подписи перевозчика.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth } from "@/lib/api-client";
import { SignatureAssetEditor } from "@/components/signatures/SignatureAssetEditor";

export const Route = createFileRoute("/carrier/signature-settings")({
  head: () => ({ meta: [{ title: "Печать и подпись — кабинет перевозчика" }] }),
  component: SignatureSettingsPage,
});

interface AssetRow {
  id: string;
  is_active: boolean;
  carrier_ext_id: string;
  stamp_url: string | null;
  signature_url: string | null;
  created_at: string;
}

interface Me {
  ok: boolean;
  ext?: { id?: string } | null;
}

function SignatureSettingsPage() {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["carrier", "me"],
    queryFn: () => apiGetAuth<Me>("/api/carrier/me", 10000),
    staleTime: 60_000,
  });
  const carrierExtId = me.data?.ext?.id ?? null;
  const list = useQuery({
    queryKey: ["sig-assets", carrierExtId],
    enabled: !!carrierExtId,
    queryFn: () =>
      apiGetAuth<{ rows: AssetRow[] }>(
        `/api/inbound-signatures/assets?carrier_ext_id=${encodeURIComponent(carrierExtId!)}`,
        10000,
      ),
    staleTime: 30_000,
  });
  const active = (list.data?.rows ?? []).find((r) => r.is_active);

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Текущий активный образец</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {me.isLoading ? (
            <span className="text-muted-foreground inline-flex items-center"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Загрузка…</span>
          ) : !carrierExtId ? (
            <div className="text-muted-foreground">Кабинет перевозчика не активирован.</div>
          ) : active ? (
            <div className="space-y-2">
              <div><Badge>Активен</Badge> от {new Date(active.created_at).toLocaleString("ru-RU")}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Preview title="Печать" url={active.stamp_url} />
                <Preview title="Подпись" url={active.signature_url} />
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">Образец ещё не загружен.</div>
          )}
        </CardContent>
      </Card>

      <SignatureAssetEditor
        carrierExtId={carrierExtId}
        onSaved={() => qc.invalidateQueries({ queryKey: ["sig-assets"] })}
      />
    </div>
  );
}

function Preview({ title, url }: { title: string; url: string | null }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{title}</div>
      <div className="flex h-32 items-center justify-center rounded border bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#fff_0%_50%)_50%_/_16px_16px]">
        {url ? <img src={url} alt={title} style={{ maxHeight: "100%", maxWidth: "100%" }} /> : (
          <span className="text-xs text-muted-foreground">Нет</span>
        )}
      </div>
    </div>
  );
}
