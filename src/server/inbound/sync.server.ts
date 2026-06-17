// Оркестратор синхронизации входящих писем перевозчика → storage + БД + парсинг.
// Использует пользовательский RLS-клиент (никакого service_role).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { fetchInbox, type CarrierImapAccount } from "@/server/inbound/imap.server";
import { parseInboundAttachment } from "@/server/inbound/parser.server";

export interface SyncResult {
  ok: boolean;
  fetched: number;
  imported: number;
  skipped: number;
  parsed: number;
  needsReview: number;
  failed: number;
  message?: string;
  error?: string;
}

export async function syncCarrierInbox(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<Database>,
  carrierExtId: string,
): Promise<SyncResult> {
  // 1. Загрузить IMAP-креды
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accRes = await (sb.from("dispatcher_carrier_email_accounts") as any)
    .select(
      "imap_host, imap_port, imap_secure, imap_user, imap_password_encrypted, is_active",
    )
    .eq("carrier_ext_id", carrierExtId)
    .maybeSingle();
  const acc = accRes.data as CarrierImapAccount & { is_active?: boolean } | null;
  if (!acc || !acc.imap_host || !acc.imap_user || !acc.imap_password_encrypted) {
    return {
      ok: false,
      fetched: 0,
      imported: 0,
      skipped: 0,
      parsed: 0,
      needsReview: 0,
      failed: 0,
      message:
        "Почта перевозчика не подключена. Сначала укажите IMAP-настройки в разделе «Почта».",
    };
  }

  let emails;
  try {
    emails = await fetchInbox(acc);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[inbound-sync] imap failed", { carrierExtId, error: msg });
    return {
      ok: false,
      fetched: 0,
      imported: 0,
      skipped: 0,
      parsed: 0,
      needsReview: 0,
      failed: 0,
      error: msg,
      message: "Не удалось подключиться к почтовому серверу. Проверьте логин/пароль/IMAP-хост.",
    };
  }

  let imported = 0;
  let skipped = 0;
  let parsed = 0;
  let needsReview = 0;
  let failed = 0;

  for (const email of emails) {
    for (const att of email.attachments) {
      // Дедупликация: проверка по уникальному индексу
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exists = await (sb.from("dispatcher_inbound_documents") as any)
        .select("id")
        .eq("carrier_ext_id", carrierExtId)
        .eq("email_message_id", email.messageId)
        .eq("attachment_hash", att.hash)
        .maybeSingle();
      if (exists.data) {
        skipped++;
        continue;
      }

      const yyyy = (email.date ?? new Date()).getUTCFullYear();
      const mm = String((email.date ?? new Date()).getUTCMonth() + 1).padStart(2, "0");
      const safeName = att.filename.replace(/[^\w.\-]+/g, "_").slice(0, 120);
      const storagePath = `${carrierExtId}/${yyyy}/${mm}/${att.hash}-${safeName}`;

      const up = await sb.storage
        .from("inbound-documents")
        .upload(storagePath, att.content, {
          contentType: att.mimeType,
          upsert: true,
        });
      if (up.error) {
        console.error("[inbound-sync] storage upload failed", {
          carrierExtId,
          storagePath,
          error: up.error.message,
        });
        failed++;
        continue;
      }

      // Парсинг
      let parseRes;
      try {
        parseRes = await parseInboundAttachment(att.content, att.mimeType, att.filename);
      } catch (e) {
        parseRes = null;
        console.error("[inbound-sync] parse failed", {
          carrierExtId,
          file: att.filename,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      const status = !parseRes
        ? "failed"
        : parseRes.needsReview
          ? "needs_review"
          : "parsed";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ins = await (sb.from("dispatcher_inbound_documents") as any).insert({
        carrier_ext_id: carrierExtId,
        email_message_id: email.messageId,
        email_from: email.from,
        email_subject: email.subject,
        email_date: email.date?.toISOString() ?? null,
        attachment_filename: att.filename,
        attachment_mime_type: att.mimeType,
        attachment_size: att.size,
        attachment_hash: att.hash,
        storage_bucket: "inbound-documents",
        storage_path: storagePath,
        document_kind: parseRes?.documentKind ?? "other",
        processing_status: status,
        extracted_text: parseRes?.text ?? null,
        parsed_payload: parseRes ? { fields: parseRes.fields, missing: parseRes.missing } : null,
        parse_confidence: parseRes?.confidence ?? null,
        parse_warnings: parseRes?.warnings ?? null,
      });
      if (ins.error) {
        console.error("[inbound-sync] insert failed", {
          carrierExtId,
          error: ins.error.message,
        });
        failed++;
        continue;
      }
      imported++;
      if (status === "needs_review") needsReview++;
      else if (status === "parsed") parsed++;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("dispatcher_carrier_email_accounts") as any)
    .update({ last_inbox_check_at: new Date().toISOString() })
    .eq("carrier_ext_id", carrierExtId);

  return {
    ok: true,
    fetched: emails.length,
    imported,
    skipped,
    parsed,
    needsReview,
    failed,
    message:
      imported > 0
        ? `Получено новых документов: ${imported}. Требуют проверки: ${needsReview}.`
        : "Новых заявок не найдено.",
  };
}
