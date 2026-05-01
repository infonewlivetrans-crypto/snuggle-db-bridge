import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileText, CheckCircle2, AlertCircle, Trash2, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/auth-context";
import { uploadPublicFile } from "@/lib/uploads";

export type CarrierDocsStatus = "awaiting" | "uploaded" | "needs_fix" | "accepted";

const STATUS_LABELS: Record<CarrierDocsStatus, string> = {
  awaiting: "Ожидаются",
  uploaded: "Загружены",
  needs_fix: "Требуется исправление",
  accepted: "Приняты",
};

const STATUS_STYLES: Record<CarrierDocsStatus, string> = {
  awaiting: "bg-slate-100 text-slate-900 border-slate-200",
  uploaded: "bg-blue-100 text-blue-900 border-blue-200",
  needs_fix: "bg-amber-100 text-amber-900 border-amber-200",
  accepted: "bg-emerald-100 text-emerald-900 border-emerald-200",
};

const KIND_LABELS: Record<string, string> = {
  signed: "Подписанные документы",
  waybill: "Акт / накладная",
  qr: "Фото QR-кодов",
  other: "Прочее",
};

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "signed", label: "Подписанные документы" },
  { value: "waybill", label: "Акт / накладная" },
  { value: "qr", label: "Фото QR-кодов" },
  { value: "other", label: "Прочее" },
];

type RouteRow = {
  id: string;
  status: string;
  carrier_id: string | null;
  carrier_docs_status: CarrierDocsStatus;
  carrier_docs_comment: string | null;
  carrier_docs_uploaded_at: string | null;
  carrier_docs_uploaded_by: string | null;
  carrier_docs_accepted_at: string | null;
  carrier_docs_accepted_by: string | null;
  carrier_docs_fix_reason: string | null;
};

type Doc = {
  id: string;
  route_id: string;
  carrier_id: string | null;
  kind: string;
  file_url: string;
  comment: string | null;
  uploaded_by_label: string | null;
  created_at: string;
};

export function CarrierDocumentsBlock({
  routeId,
  mode,
}: {
  routeId: string;
  mode: "carrier" | "logist";
}) {
  const { user, profile, roles } = useAuth();
  const qc = useQueryClient();
  const [uploadKind, setUploadKind] = useState<string>("signed");
  const [uploading, setUploading] = useState(false);
  const [comment, setComment] = useState("");
  const [fixReason, setFixReason] = useState("");

  const { data: route } = useQuery({
    queryKey: ["carrier-docs-route", routeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select(
          "id,status,carrier_id,carrier_docs_status,carrier_docs_comment,carrier_docs_uploaded_at,carrier_docs_uploaded_by,carrier_docs_accepted_at,carrier_docs_accepted_by,carrier_docs_fix_reason",
        )
        .eq("id", routeId)
        .maybeSingle();
      if (error) throw error;
      return data as RouteRow | null;
    },
  });

  const { data: docs = [] } = useQuery({
    queryKey: ["carrier-docs-list", routeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_carrier_documents")
        .select("*")
        .eq("route_id", routeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Doc[];
    },
  });

  const isCarrier = mode === "carrier";
  const isStaff = roles.includes("admin") || roles.includes("director") || roles.includes("logist");
  const status = route?.carrier_docs_status ?? "awaiting";

  // Sync local comment with route
  const initialComment = route?.carrier_docs_comment ?? "";

  const handleUpload = async (file: File | undefined) => {
    if (!file || !route) return;
    setUploading(true);
    try {
      const url = await uploadPublicFile("carrier-documents", file, routeId);
      const label =
        profile?.full_name ?? user?.email ?? null;
      const { error: insErr } = await supabase.from("route_carrier_documents").insert({
        route_id: routeId,
        carrier_id: route.carrier_id,
        kind: uploadKind,
        file_url: url,
        uploaded_by: user?.id ?? null,
        uploaded_by_label: label,
      });
      if (insErr) throw insErr;

      // Move route status to uploaded if currently awaiting/needs_fix
      if (status === "awaiting" || status === "needs_fix") {
        await supabase
          .from("routes")
          .update({
            carrier_docs_status: "uploaded",
            carrier_docs_uploaded_at: new Date().toISOString(),
            carrier_docs_uploaded_by: user?.id ?? null,
          })
          .eq("id", routeId);

        await supabase.from("route_carrier_history").insert({
          route_id: routeId,
          carrier_id: route.carrier_id,
          action: "documents_uploaded",
          actor_user_id: user?.id ?? null,
          actor_label: label,
        });
      }

      toast.success("Документ загружен");
      qc.invalidateQueries({ queryKey: ["carrier-docs-list", routeId] });
      qc.invalidateQueries({ queryKey: ["carrier-docs-route", routeId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("route_carrier_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Удалено");
      qc.invalidateQueries({ queryKey: ["carrier-docs-list", routeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveComment = useMutation({
    mutationFn: async (text: string) => {
      const { error } = await supabase
        .from("routes")
        .update({ carrier_docs_comment: text })
        .eq("id", routeId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Комментарий сохранён");
      qc.invalidateQueries({ queryKey: ["carrier-docs-route", routeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acceptDocs = useMutation({
    mutationFn: async () => {
      const label = profile?.full_name ?? user?.email ?? null;
      const { error } = await supabase
        .from("routes")
        .update({
          carrier_docs_status: "accepted",
          carrier_docs_accepted_at: new Date().toISOString(),
          carrier_docs_accepted_by: user?.id ?? null,
          carrier_docs_fix_reason: null,
        })
        .eq("id", routeId);
      if (error) throw error;
      await supabase.from("route_carrier_history").insert({
        route_id: routeId,
        carrier_id: route?.carrier_id ?? null,
        action: "documents_accepted",
        actor_user_id: user?.id ?? null,
        actor_label: label,
      });
    },
    onSuccess: () => {
      toast.success("Документы приняты. Рейс закрыт.");
      qc.invalidateQueries({ queryKey: ["carrier-docs-route", routeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestFix = useMutation({
    mutationFn: async () => {
      if (!fixReason.trim()) throw new Error("Укажите причину");
      const label = profile?.full_name ?? user?.email ?? null;
      const { error } = await supabase
        .from("routes")
        .update({
          carrier_docs_status: "needs_fix",
          carrier_docs_fix_reason: fixReason.trim(),
        })
        .eq("id", routeId);
      if (error) throw error;
      await supabase.from("route_carrier_history").insert({
        route_id: routeId,
        carrier_id: route?.carrier_id ?? null,
        action: "documents_rejected",
        actor_user_id: user?.id ?? null,
        actor_label: label,
        reason: fixReason.trim(),
      });
    },
    onSuccess: () => {
      toast.success("Отправлено на исправление");
      setFixReason("");
      qc.invalidateQueries({ queryKey: ["carrier-docs-route", routeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!route) return null;

  // Carrier sees this only on routes assigned to them
  if (isCarrier && profile?.carrier_id !== route.carrier_id) return null;
  // Hide for non-carriers/non-staff
  if (!isCarrier && !isStaff) return null;

  const canUpload =
    isCarrier && (status === "awaiting" || status === "uploaded" || status === "needs_fix");
  const canReview = isStaff && (status === "uploaded" || status === "needs_fix");

  // Required document kinds checklist
  const requiredKinds: string[] = ["signed", "waybill"];
  const presentKinds = new Set(docs.map((d) => d.kind));
  const missing = requiredKinds.filter((k) => !presentKinds.has(k));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-5 w-5" />
          Документы по рейсу
        </CardTitle>
        <Badge variant="outline" className={STATUS_STYLES[status]}>
          {STATUS_LABELS[status]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "needs_fix" && route.carrier_docs_fix_reason && (
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">Требуется исправление</div>
              <div className="text-xs mt-0.5">{route.carrier_docs_fix_reason}</div>
            </div>
          </div>
        )}

        {/* Required documents checklist */}
        {(isStaff || isCarrier) && (
          <div className="rounded-md border border-border p-3 text-sm">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Требуемые документы
            </div>
            <ul className="space-y-1">
              {requiredKinds.map((k) => (
                <li key={k} className="flex items-center gap-2">
                  {presentKinds.has(k) ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                  )}
                  <span>{KIND_LABELS[k]}</span>
                  {!presentKinds.has(k) && (
                    <span className="text-xs text-muted-foreground">— отсутствует</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Upload (carrier only) */}
        {canUpload && (
          <div className="rounded-md border border-dashed border-border p-3 space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Загрузить документ
            </Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={uploadKind}
              onChange={(e) => setUploadKind(e.target.value)}
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-secondary/30 text-xs text-muted-foreground hover:bg-secondary/60">
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Загрузка…</span>
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  <span>Выбрать фото / файл</span>
                </>
              )}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                disabled={uploading}
                onChange={(e) => handleUpload(e.target.files?.[0])}
              />
            </label>
          </div>
        )}

        {/* Documents list */}
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Загруженные документы ({docs.length})
          </div>
          {docs.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-3 text-center text-sm text-muted-foreground">
              Документы пока не загружены
            </div>
          ) : (
            <ul className="space-y-2">
              {docs.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center gap-3 rounded-md border border-border p-2 text-sm"
                >
                  {d.file_url.match(/\.(png|jpe?g|webp|gif)$/i) ? (
                    <a href={d.file_url} target="_blank" rel="noreferrer">
                      <img
                        src={d.file_url}
                        alt={KIND_LABELS[d.kind] ?? d.kind}
                        className="h-12 w-12 rounded object-cover"
                      />
                    </a>
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {KIND_LABELS[d.kind] ?? d.kind}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {d.uploaded_by_label ?? "—"} •{" "}
                      {new Date(d.created_at).toLocaleString("ru-RU")}
                    </div>
                  </div>
                  <a
                    href={d.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary underline"
                  >
                    Открыть
                  </a>
                  {isCarrier && status !== "accepted" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteDoc.mutate(d.id)}
                      disabled={deleteDoc.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Carrier comment */}
        <div className="space-y-2">
          <Label htmlFor="docs-comment">Комментарий перевозчика</Label>
          {isCarrier && status !== "accepted" ? (
            <CommentEditor
              initial={initialComment}
              onSave={(t) => saveComment.mutate(t)}
              saving={saveComment.isPending}
            />
          ) : (
            <div className="rounded-md border border-border bg-muted/40 p-2 text-sm">
              {initialComment || <span className="text-muted-foreground">—</span>}
            </div>
          )}
        </div>

        {/* History summary */}
        <div className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 text-xs sm:grid-cols-2">
          <div>
            <div className="text-muted-foreground">Загружено</div>
            <div>
              {route.carrier_docs_uploaded_at
                ? new Date(route.carrier_docs_uploaded_at).toLocaleString("ru-RU")
                : "—"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Принято</div>
            <div>
              {route.carrier_docs_accepted_at
                ? new Date(route.carrier_docs_accepted_at).toLocaleString("ru-RU")
                : "—"}
            </div>
          </div>
        </div>

        {/* Logist actions */}
        {canReview && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Проверка документов
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => acceptDocs.mutate()}
                disabled={acceptDocs.isPending || docs.length === 0}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                Принять документы
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fix-reason">Причина возврата на исправление</Label>
              <Textarea
                id="fix-reason"
                value={fixReason}
                onChange={(e) => setFixReason(e.target.value)}
                rows={2}
                placeholder="Например: нечитаемая подпись, отсутствует штамп…"
              />
              <Button
                variant="outline"
                onClick={() => requestFix.mutate()}
                disabled={requestFix.isPending || !fixReason.trim()}
                className="gap-2"
              >
                <AlertCircle className="h-4 w-4" />
                Отправить на исправление
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CommentEditor({
  initial,
  onSave,
  saving,
}: {
  initial: string;
  onSave: (text: string) => void;
  saving: boolean;
}) {
  const [text, setText] = useState(initial);
  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Комментарий по документам…"
      />
      <Button size="sm" onClick={() => onSave(text)} disabled={saving}>
        Сохранить
      </Button>
    </div>
  );
}
