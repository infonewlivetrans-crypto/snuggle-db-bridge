// Блок подписи входящего документа: статусы, кнопки «Подготовить подпись»,
// «Подписать», «Загрузить вручную подписанный документ».
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, FileSignature, Upload, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth, apiPost } from "@/lib/api-client";
import type { Placement } from "@/lib/signatures/types";
import { SignaturePlacementEditor } from "./SignaturePlacementEditor";

interface Props {
  inboundDocumentId: string;
  carrierExtId: string;
  tripId?: string | null;
}

interface AssetRow {
  id: string;
  is_active: boolean;
  carrier_ext_id: string;
}

interface PreviewResp {
  ok?: boolean;
  needs_manual_placement?: boolean;
  reason?: string | null;
  placement?: Placement;
  pdf?: { page_count: number; first_page: { w: number; h: number } };
  signature_asset_id?: string;
  error?: string;
  message?: string;
}

export function InboundSignatureBlock({ inboundDocumentId, carrierExtId, tripId }: Props) {
  const qc = useQueryClient();
  const assets = useQuery({
    queryKey: ["sig-assets", carrierExtId],
    queryFn: () =>
      apiGetAuth<{ rows: AssetRow[] }>(
        `/api/inbound-signatures/assets?carrier_ext_id=${encodeURIComponent(carrierExtId)}`,
        10000,
      ),
    staleTime: 30_000,
  });
  const hasAsset = (assets.data?.rows ?? []).some((r) => r.is_active);

  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const previewMut = useMutation({
    mutationFn: async () =>
      apiPost<PreviewResp>(`/api/inbound-signatures/${inboundDocumentId}/sign-preview`, {}),
    onSuccess: (r) => {
      if (r.error) {
        toast.error(r.message ?? r.error);
        return;
      }
      setPreview(r);
      if (r.placement) setPlacement(r.placement);
      if (r.needs_manual_placement) {
        toast.warning("Место подписи не найдено автоматически — проверьте размещение вручную");
      } else {
        toast.success("Размещение подписи рассчитано — проверьте и нажмите «Подписать»");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Защита от двойного клика
  const signingRef = useRef(false);
  const confirmMut = useMutation({
    mutationFn: async () => {
      if (signingRef.current) throw new Error("Подписание уже выполняется");
      signingRef.current = true;
      try {
        return await apiPost<{ ok: boolean; signed_path?: string; error?: string }>(
          `/api/inbound-signatures/${inboundDocumentId}/sign-confirm`,
          { placement, signature_asset_id: preview?.signature_asset_id ?? null },
          15000,
        );
      } finally {
        signingRef.current = false;
      }
    },
    onSuccess: () => {
      toast.success("Документ подписан и сохранён");
      setPreview(null);
      setPlacement(null);
      qc.invalidateQueries({ queryKey: ["inbound-doc", inboundDocumentId] });
      qc.invalidateQueries({ queryKey: ["carrier", "inbound-documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fileRef = useRef<HTMLInputElement | null>(null);
  const manualMut = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append("file", f);
      return apiPost<{ ok: boolean }>(
        `/api/inbound-signatures/${inboundDocumentId}/manual-upload`,
        fd,
        15000,
      );
    },
    onSuccess: () => {
      toast.success("Подписанный документ загружен");
      qc.invalidateQueries({ queryKey: ["inbound-doc", inboundDocumentId] });
      qc.invalidateQueries({ queryKey: ["carrier", "inbound-documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (preview?.placement && !placement) setPlacement(preview.placement);
  }, [preview, placement]);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base">Подпись и печать перевозчика</CardTitle>
        {tripId && <Badge variant="default">Рейс создан</Badge>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!hasAsset && (
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            Печать и подпись перевозчика ещё не настроены.
            <div className="mt-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/carrier/signature-settings">
                  Настроить печать и подпись
                </Link>
              </Button>
            </div>
          </div>
        )}

        {hasAsset && !preview && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => previewMut.mutate()} disabled={previewMut.isPending}>
              {previewMut.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <FileSignature className="mr-1 h-4 w-4" />
              )}
              Подготовить подпись
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={manualMut.isPending}>
              {manualMut.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1 h-4 w-4" />
              )}
              Загрузить подписанный документ
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) manualMut.mutate(f);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {preview?.needs_manual_placement && (
          <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            Не удалось точно определить место подписи перевозчика. Проверьте страницу и координаты
            ниже, при необходимости поправьте.
          </div>
        )}

        {placement && preview?.pdf && (
          <>
            <SignaturePlacementEditor
              placement={placement}
              pageCount={preview.pdf.page_count}
              pageSize={preview.pdf.first_page}
              onChange={setPlacement}
            />
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={() => confirmMut.mutate()}
                disabled={confirmMut.isPending}
              >
                {confirmMut.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <FileSignature className="mr-1 h-4 w-4" />
                )}
                Подписать и сохранить
              </Button>
              <Button variant="ghost" onClick={() => { setPreview(null); setPlacement(null); }}>
                Отмена
              </Button>
            </div>
          </>
        )}

        <SignedHistory inboundDocumentId={inboundDocumentId} />
      </CardContent>
    </Card>
  );
}

interface HistoryItem {
  id: string;
  status: string;
  signed_at: string | null;
  signed_url: string | null;
  manual_url: string | null;
}
function SignedHistory({ inboundDocumentId }: { inboundDocumentId: string }) {
  const q = useQuery({
    queryKey: ["sig-history", inboundDocumentId],
    queryFn: () =>
      apiGetAuth<{ rows: HistoryItem[] }>(
        `/api/inbound-signatures/history?inbound_document_id=${encodeURIComponent(inboundDocumentId)}`,
        10000,
      ),
    staleTime: 10_000,
    retry: false,
  });
  const rows = q.data?.rows ?? [];
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1 border-t pt-2 text-xs">
      <div className="text-muted-foreground">История подписей:</div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between">
          <span>
            {r.status === "signed" ? "Подписан системой" : r.status === "manual_uploaded" ? "Загружен вручную" : r.status}
            {r.signed_at && ` · ${new Date(r.signed_at).toLocaleString("ru-RU")}`}
          </span>
          {(r.signed_url || r.manual_url) && (
            <a
              href={(r.signed_url ?? r.manual_url) as string}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center text-primary hover:underline"
            >
              <ExternalLink className="mr-1 h-3 w-3" /> Открыть
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
