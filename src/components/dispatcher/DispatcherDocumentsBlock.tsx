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
import {
  Upload,
  Check,
  X,
  Archive,
  ExternalLink,
  FileText,
  Loader2,
} from "lucide-react";
import {
  documentsApi,
  documentTypesFor,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  type DocumentDTO,
  type DocumentOwnerType,
  type DocumentStatus,
} from "@/lib/dispatcher/documents";
import { authHeaders } from "@/lib/api-client";

interface Props {
  ownerType: DocumentOwnerType;
  ownerId: string;
  onChanged?: (docs: DocumentDTO[]) => void;
}

function statusVariant(s: DocumentStatus): "default" | "outline" | "destructive" | "secondary" {
  if (s === "approved") return "default";
  if (s === "rejected") return "destructive";
  if (s === "archived" || s === "expired") return "secondary";
  return "outline";
}

export function DispatcherDocumentsBlock({ ownerType, ownerId, onChanged }: Props) {
  const [docs, setDocs] = useState<DocumentDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await documentsApi.list({ owner_type: ownerType, owner_id: ownerId, limit: 100 });
      setDocs(res.rows);
      onChanged?.(res.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки документов");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [ownerType, ownerId]);

  const setStatus = async (id: string, status: DocumentStatus, comment?: string) => {
    try {
      await documentsApi.update(id, { document_status: status, ...(comment ? { comment } : {}) });
      toast.success("Статус документа обновлён");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось обновить");
    }
  };

  const archive = async (id: string) => {
    if (!confirm("Перенести документ в архив?")) return;
    try {
      await documentsApi.archive(id);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось архивировать");
    }
  };

  const reject = async (doc: DocumentDTO) => {
    const reason = prompt("Причина отклонения:", doc.comment ?? "");
    if (reason === null) return;
    await setStatus(doc.id, "rejected", reason);
  };

  const handleOpen = async (doc: DocumentDTO) => {
    if (!doc.file_path) {
      toast.info("К документу не приложен файл");
      return;
    }
    try {
      const res = await fetch(documentsApi.downloadUrl(doc.id), {
        credentials: "same-origin",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось открыть документ");
    }
  };

  const types = documentTypesFor(ownerType);

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">Документы</div>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Upload className="h-4 w-4 mr-1" /> Добавить документ
        </Button>
      </div>

      {loading && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Загрузка…</div>}

      {!loading && docs.length === 0 && (
        <div className="text-sm text-muted-foreground">Документов нет</div>
      )}

      {docs.length > 0 && (
        <ul className="divide-y">
          {docs.map((d) => (
            <li key={d.id} className="py-2 flex flex-wrap items-start gap-3 text-sm">
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
                {d.title && <div className="text-xs text-muted-foreground">{d.title}</div>}
                {d.file_name && (
                  <div className="text-xs text-muted-foreground truncate">{d.file_name}</div>
                )}
                {d.comment && (
                  <div className="text-xs italic text-muted-foreground">{d.comment}</div>
                )}
                <div className="text-[11px] text-muted-foreground">
                  Загружен: {new Date(d.uploaded_at).toLocaleString("ru-RU")}
                  {d.checked_at && ` · Проверен: ${new Date(d.checked_at).toLocaleString("ru-RU")}`}
                </div>
              </div>
              <div className="flex flex-wrap gap-1 shrink-0">
                {d.file_path && (
                  <Button size="sm" variant="ghost" onClick={() => handleOpen(d)} title="Открыть">
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={d.document_status === "approved" ? "default" : "outline"}
                  onClick={() => setStatus(d.id, "approved")}
                  title="Одобрить"
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant={d.document_status === "rejected" ? "destructive" : "outline"}
                  onClick={() => reject(d)}
                  title="Отклонить"
                >
                  <X className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => archive(d.id)}
                  title="В архив"
                >
                  <Archive className="h-3 w-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddDocumentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        ownerType={ownerType}
        ownerId={ownerId}
        types={types}
        onCreated={load}
      />
    </div>
  );
}

function AddDocumentDialog({
  open,
  onOpenChange,
  ownerType,
  ownerId,
  types,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownerType: DocumentOwnerType;
  ownerId: string;
  types: readonly string[];
  onCreated: () => void;
}) {
  const [docType, setDocType] = useState<string>(types[0] ?? "other");
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setDocType(types[0] ?? "other");
      setTitle("");
      setComment("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open, types]);

  const submit = async () => {
    setSubmitting(true);
    try {
      let filePart: {
        file_path?: string;
        file_name?: string;
        file_mime?: string;
        file_size?: number;
      } = {};
      const f = fileRef.current?.files?.[0];
      if (f) {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("owner_type", ownerType);
        fd.append("owner_id", ownerId);
        const res = await documentsApi.uploadFile(fd);
        filePart = res;
      }
      await documentsApi.create({
        owner_type: ownerType,
        owner_id: ownerId,
        document_type: docType,
        title: title || null,
        comment: comment || null,
        ...filePart,
      });
      toast.success("Документ добавлен");
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось добавить документ");
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
            Загрузка файла необязательна — можно создать запись и приложить файл позже.
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
            <div className="text-xs text-muted-foreground mb-1">Файл (jpg/png/webp/pdf, до 20 МБ)</div>
            <Input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" />
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

export function summarizeDocuments(docs: DocumentDTO[]): {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
} {
  let approved = 0,
    rejected = 0,
    pending = 0;
  for (const d of docs) {
    if (d.document_status === "approved") approved++;
    else if (d.document_status === "rejected") rejected++;
    else if (d.document_status === "uploaded" || d.document_status === "checking") pending++;
  }
  return { total: docs.length, approved, rejected, pending };
}
