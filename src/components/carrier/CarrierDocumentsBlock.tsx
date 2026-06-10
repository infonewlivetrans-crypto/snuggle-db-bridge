import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Upload, Loader2, FileText, ExternalLink } from "lucide-react";
import { apiGetAuth, apiPost, authHeaders } from "@/lib/api-client";
import {
  carrierDocumentsApi,
  documentTypesFor,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  type DocumentDTO,
  type DocumentOwnerType,
  type DocumentStatus,
} from "@/lib/dispatcher/documents";

interface Props {
  ownerType: DocumentOwnerType;
  ownerId: string;
  title?: string;
}

function statusVariant(s: DocumentStatus): "default" | "outline" | "destructive" | "secondary" {
  if (s === "approved") return "default";
  if (s === "rejected") return "destructive";
  if (s === "archived" || s === "expired") return "secondary";
  return "outline";
}

export function CarrierDocumentsBlock({ ownerType, ownerId, title }: Props) {
  const [docs, setDocs] = useState<DocumentDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiGetAuth<{ ok: boolean; rows: DocumentDTO[] }>(
        `/api/carrier/documents?owner_type=${encodeURIComponent(ownerType)}&owner_id=${encodeURIComponent(ownerId)}`,
        10000,
      );
      setDocs(res.rows ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки документов");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ownerId) void load(); }, [ownerType, ownerId]);

  if (!ownerId) return null;

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{title ?? "Документы"}</div>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Upload className="h-3 w-3 mr-1" /> Добавить
        </Button>
      </div>

      {loading && (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Загрузка…
        </div>
      )}

      {!loading && docs.length === 0 && (
        <div className="text-xs text-muted-foreground">Документов пока нет</div>
      )}

      {docs.length > 0 && (
        <ul className="divide-y text-sm">
          {docs.map((d) => (
            <li key={d.id} className="py-2 flex items-start gap-2">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {DOCUMENT_TYPE_LABELS[d.document_type] ?? d.document_type}
                  </span>
                  <Badge variant={statusVariant(d.document_status)}>
                    {DOCUMENT_STATUS_LABELS[d.document_status]}
                  </Badge>
                </div>
                {(d.title || d.file_name) && (
                  <div className="text-xs text-muted-foreground truncate">
                    {d.title || d.file_name}
                    {d.file_size ? ` · ${Math.round(d.file_size / 1024)} КБ` : ""}
                  </div>
                )}
                {d.comment && (
                  <div className="text-xs italic text-muted-foreground">
                    Комментарий диспетчера: {d.comment}
                  </div>
                )}
              </div>
              {d.file_path && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/dispatcher/documents/${d.id}/download`, {
                        credentials: "same-origin",
                        headers: authHeaders(),
                      });
                      if (!res.ok) throw new Error(`HTTP ${res.status}`);
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
                      setTimeout(() => URL.revokeObjectURL(url), 60_000);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Не удалось открыть");
                    }
                  }}
                  title="Открыть"
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        ownerType={ownerType}
        ownerId={ownerId}
        onCreated={load}
      />
    </div>
  );
}

function AddDialog({
  open,
  onOpenChange,
  ownerType,
  ownerId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownerType: DocumentOwnerType;
  ownerId: string;
  onCreated: () => void;
}) {
  const types = documentTypesFor(ownerType);
  const [docType, setDocType] = useState<string>(types[0] ?? "other");
  const [title, setTitle] = useState("");
  const [filePath, setFilePath] = useState("");
  const [fileName, setFileName] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setDocType(types[0] ?? "other");
      setTitle("");
      setFilePath("");
      setFileName("");
      setComment("");
    }
  }, [open, types]);

  const submit = async () => {
    setSubmitting(true);
    try {
      await apiPost("/api/carrier/documents", {
        owner_type: ownerType,
        owner_id: ownerId,
        document_type: docType,
        title: title || null,
        file_path: filePath || null,
        file_name: fileName || null,
        comment: comment || null,
        document_status: "uploaded",
      });
      toast.success("Документ добавлен");
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось добавить");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новый документ</DialogTitle>
          <DialogDescription>
            Укажите тип и приложите ссылку или название файла. Файл проверит диспетчер.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Тип документа</div>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>
                    {DOCUMENT_TYPE_LABELS[t] ?? t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Название (необязательно)</div>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Название файла</div>
            <Input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="passport.pdf" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Ссылка / путь к файлу</div>
            <Input value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="https://… или storage path" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Комментарий</div>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Отмена</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
