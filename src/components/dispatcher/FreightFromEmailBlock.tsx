import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Mail, Loader2, Plus, Trash2, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiPost } from "@/lib/api-client";
import { toast } from "sonner";
import {
  FREIGHT_DOC_TYPES,
  DOCUMENT_TYPE_LABELS,
  documentsApi,
} from "@/lib/dispatcher/documents";
import { IncomingEmailSettingsDialog } from "./IncomingEmailSettingsDialog";

interface Attachment {
  id: string;
  file: File | null;
  file_name: string;
  document_type: string;
  comment: string;
}

function emptyAttachment(): Attachment {
  return {
    id: crypto.randomUUID(),
    file: null,
    file_name: "",
    document_type: "customer_request_pdf",
    comment: "",
  };
}

interface Props {
  onCreated?: () => void;
}

export function FreightFromEmailBlock({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [form, setForm] = useState({
    source_email_from: "",
    customer_email: "",
    source_email_subject: "",
    source_email_body: "",
    source_received_at: "",
    customer_name: "",
    customer_phone: "",
    extracted_text: "",
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const syncMut = useMutation({
    mutationFn: () => apiPost<{ message?: string }>("/api/dispatcher/incoming-email/sync", {}),
    onSuccess: (res) =>
      toast.message("Проверка почты", {
        description: res.message ?? "Готово",
      }),
    onError: (e: unknown) =>
      toast.error("Не удалось", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  const resetForm = () => {
    setForm({
      source_email_from: "",
      customer_email: "",
      source_email_subject: "",
      source_email_body: "",
      source_received_at: "",
      customer_name: "",
      customer_phone: "",
      extracted_text: "",
    });
    setAttachments([]);
  };

  const submit = async () => {
    setUploading(true);
    try {
      // Шаг 1. Создать dispatcher_freight без вложений
      const payload = {
        source_email_from: form.source_email_from || null,
        customer_email: form.customer_email || form.source_email_from || null,
        source_email_subject: form.source_email_subject || null,
        source_email_body: form.source_email_body || null,
        source_received_at: form.source_received_at
          ? new Date(form.source_received_at).toISOString()
          : null,
        customer_name: form.customer_name || null,
        customer_phone: form.customer_phone || null,
        extracted_text: form.extracted_text || null,
        attachments: [],
      };
      const res = await apiPost<{
        row: { id: string; parse_status: string };
        parse_status: string;
        missing_fields: string[];
      }>("/api/dispatcher/freights/from-email", payload);
      const freightId = res.row.id;

      // Шаг 2. Загрузить вложения через documents upload API,
      // создать строки dispatcher_documents с owner_type=freight.
      const realAttachments = attachments.filter((a) => a.file);
      let uploaded = 0;
      for (const a of realAttachments) {
        if (!a.file) continue;
        const fd = new FormData();
        fd.append("file", a.file);
        fd.append("owner_type", "freight");
        fd.append("owner_id", freightId);
        const up = await documentsApi.uploadFile(fd);
        await documentsApi.create({
          owner_type: "freight",
          owner_id: freightId,
          document_type: a.document_type,
          title: a.file_name || a.file.name,
          file_path: up.file_path,
          file_name: up.file_name,
          file_mime: up.file_mime,
          file_size: up.file_size,
          comment: a.comment || null,
        });
        uploaded += 1;
      }

      toast.success(
        `Заявка создана (${res.parse_status})` +
          (uploaded ? `, загружено вложений: ${uploaded}` : "") +
          (res.missing_fields?.length
            ? `. Не распознано: ${res.missing_fields.join(", ")}`
            : ""),
      );
      setOpen(false);
      resetForm();
      onCreated?.();
    } catch (e) {
      toast.error("Не удалось создать", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4" />
          <span className="text-sm font-semibold">Импорт письма заказчика</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            title="Проверить почту (в разработке)"
          >
            {syncMut.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
            )}
            Проверить почту
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSettingsOpen(true)}
            title="Настройки почты"
          >
            <Settings className="mr-1 h-3.5 w-3.5" />
            Настройки
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
            {open ? "Свернуть" : "Импорт письма"}
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">От кого</Label>
              <Input
                value={form.source_email_from}
                onChange={(e) => setForm({ ...form, source_email_from: e.target.value })}
                placeholder="customer@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email заказчика</Label>
              <Input
                value={form.customer_email}
                onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Тема письма</Label>
              <Input
                value={form.source_email_subject}
                onChange={(e) => setForm({ ...form, source_email_subject: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Имя заказчика</Label>
              <Input
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Телефон</Label>
              <Input
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Дата получения</Label>
              <Input
                type="datetime-local"
                value={form.source_received_at}
                onChange={(e) => setForm({ ...form, source_received_at: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Текст письма</Label>
              <Textarea
                value={form.source_email_body}
                onChange={(e) => setForm({ ...form, source_email_body: e.target.value })}
                rows={5}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">
                Текст из PDF (вставить, чтобы автоматически разобрать)
              </Label>
              <Textarea
                value={form.extracted_text}
                onChange={(e) => setForm({ ...form, extracted_text: e.target.value })}
                rows={5}
                placeholder="Скопируйте сюда текст PDF-заявки для автоматического разбора"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Вложения письма (PDF, JPG, PNG)</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setAttachments([...attachments, emptyAttachment()])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Добавить
              </Button>
            </div>
            {attachments.map((a, i) => (
              <div key={a.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-2">
                <Input
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    const next = [...attachments];
                    next[i] = {
                      ...a,
                      file,
                      file_name: file?.name ?? a.file_name,
                    };
                    setAttachments(next);
                  }}
                />
                <Select
                  value={a.document_type}
                  onValueChange={(v) => {
                    const next = [...attachments];
                    next[i] = { ...a, document_type: v };
                    setAttachments(next);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREIGHT_DOC_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {DOCUMENT_TYPE_LABELS[t] ?? t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2 sm:col-span-2">
                  <Input
                    placeholder="Комментарий"
                    value={a.comment}
                    onChange={(e) => {
                      const next = [...attachments];
                      next[i] = { ...a, comment: e.target.value };
                      setAttachments(next);
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      setAttachments(attachments.filter((x) => x.id !== a.id))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {a.file && (
                  <div className="text-xs text-muted-foreground sm:col-span-2">
                    Файл: {a.file.name} ({Math.round(a.file.size / 1024)} КБ)
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={resetForm} disabled={uploading}>
              Очистить
            </Button>
            <Button onClick={submit} disabled={uploading}>
              {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Создать входящую заявку
            </Button>
          </div>
        </div>
      )}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Настройки входящей почты</DialogTitle>
            <DialogDescription>
              Параметры почтового ящика для автоматической загрузки писем.
            </DialogDescription>
          </DialogHeader>
          <IncomingEmailSettingsDialog onClose={() => setSettingsOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
