import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Mail, Loader2, Plus, Trash2 } from "lucide-react";
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
import { apiPost } from "@/lib/api-client";
import { toast } from "sonner";
import {
  FREIGHT_DOC_TYPES,
  DOCUMENT_TYPE_LABELS,
} from "@/lib/dispatcher/documents";

interface Attachment {
  file_name: string;
  file_path: string;
  document_type: string;
  comment: string;
}

const EMPTY_ATTACHMENT: Attachment = {
  file_name: "",
  file_path: "",
  document_type: "email_attachment",
  comment: "",
};

interface Props {
  onCreated?: () => void;
}

export function FreightFromEmailBlock({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
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

  const createMut = useMutation({
    mutationFn: async () => {
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
        attachments: attachments
          .filter((a) => a.file_name || a.file_path)
          .map((a) => ({
            file_name: a.file_name || null,
            file_path: a.file_path || null,
            document_type: a.document_type,
            comment: a.comment || null,
          })),
      };
      return apiPost<{
        row: { id: string; parse_status: string };
        parse_status: string;
        missing_fields: string[];
      }>("/api/dispatcher/freights/from-email", payload);
    },
    onSuccess: (res) => {
      toast.success(
        `Заявка создана (${res.parse_status})` +
          (res.missing_fields?.length
            ? `. Не распознано: ${res.missing_fields.join(", ")}`
            : ""),
      );
      setOpen(false);
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
      onCreated?.();
    },
    onError: (e: unknown) =>
      toast.error("Не удалось создать", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4" />
          <span className="text-sm font-semibold">Добавить заявку из письма</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? "Свернуть" : "Развернуть"}
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">От кого</Label>
              <Input
                value={form.source_email_from}
                onChange={(e) =>
                  setForm({ ...form, source_email_from: e.target.value })
                }
                placeholder="customer@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email заказчика</Label>
              <Input
                value={form.customer_email}
                onChange={(e) =>
                  setForm({ ...form, customer_email: e.target.value })
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Тема письма</Label>
              <Input
                value={form.source_email_subject}
                onChange={(e) =>
                  setForm({ ...form, source_email_subject: e.target.value })
                }
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
                onChange={(e) =>
                  setForm({ ...form, source_received_at: e.target.value })
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Текст письма</Label>
              <Textarea
                value={form.source_email_body}
                onChange={(e) =>
                  setForm({ ...form, source_email_body: e.target.value })
                }
                rows={5}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">
                Текст из PDF (вставить, чтобы автоматически разобрать)
              </Label>
              <Textarea
                value={form.extracted_text}
                onChange={(e) =>
                  setForm({ ...form, extracted_text: e.target.value })
                }
                rows={5}
                placeholder="Скопируйте сюда текст PDF-заявки, чтобы система попыталась распознать поля"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Вложения письма</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setAttachments([...attachments, { ...EMPTY_ATTACHMENT }])
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Добавить
              </Button>
            </div>
            {attachments.map((a, i) => (
              <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-2">
                <Input
                  placeholder="Название файла"
                  value={a.file_name}
                  onChange={(e) => {
                    const next = [...attachments];
                    next[i] = { ...a, file_name: e.target.value };
                    setAttachments(next);
                  }}
                />
                <Input
                  placeholder="Ссылка/путь к файлу"
                  value={a.file_path}
                  onChange={(e) => {
                    const next = [...attachments];
                    next[i] = { ...a, file_path: e.target.value };
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
                <div className="flex gap-2">
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
                      setAttachments(attachments.filter((_, j) => j !== i))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
            >
              {createMut.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Создать входящую заявку
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
