// Подключение к IMAP-серверу перевозчика и сбор последних писем с вложениями.
// Использует уже зашифрованные креды из dispatcher_carrier_email_accounts.

import { createHash } from "node:crypto";
import { decryptPassword } from "@/server/email/crypto.server";

export interface CarrierImapAccount {
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  imap_user: string;
  imap_password_encrypted: string;
}

export interface InboundAttachment {
  filename: string;
  mimeType: string;
  size: number;
  hash: string;
  content: Buffer;
}

export interface InboundEmail {
  messageId: string;
  from: string;
  subject: string;
  date: Date | null;
  textBody: string;
  attachments: InboundAttachment[];
}

const ALLOWED_EXT = /\.(pdf|docx?|jpe?g|png|tif?f|bmp|webp|heic|eml|txt)$/i;
const SUBJECT_HINTS = /(заявк|договор|рейс|маршрут|перевозк|загрузк|выгрузк|груз)/i;

/**
 * Подключается к IMAP, выбирает INBOX, забирает последние N писем
 * за последние D дней, где есть вложения и тема похожа на заявку.
 */
export async function fetchInbox(
  acc: CarrierImapAccount,
  opts: { maxMessages?: number; sinceDays?: number } = {},
): Promise<InboundEmail[]> {
  const maxMessages = opts.maxMessages ?? 50;
  const sinceDays = opts.sinceDays ?? 30;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ImapFlow } = (await import("imapflow")) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { simpleParser } = (await import("mailparser")) as any;

  const pass = decryptPassword(acc.imap_password_encrypted);
  const client = new ImapFlow({
    host: acc.imap_host,
    port: acc.imap_port,
    secure: acc.imap_secure,
    auth: { user: acc.imap_user, pass },
    logger: false,
  });

  const result: InboundEmail[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);
      const uids = await client.search({ since }, { uid: true });
      const toFetch = (uids ?? []).slice(-maxMessages);
      for (const uid of toFetch) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg: any = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
        if (!msg?.source) continue;
        const parsed = await simpleParser(msg.source);
        const subject: string = parsed.subject ?? "";
        const from: string = parsed.from?.value?.[0]?.address ?? parsed.from?.text ?? "";
        const textBody: string = parsed.text ?? "";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawAtts: any[] = parsed.attachments ?? [];
        const attachments: InboundAttachment[] = [];
        for (const a of rawAtts) {
          const filename = String(a.filename ?? "");
          if (!filename || !ALLOWED_EXT.test(filename)) continue;
          const content: Buffer = a.content instanceof Buffer ? a.content : Buffer.from(a.content ?? []);
          const hash = createHash("sha256").update(content).digest("hex");
          attachments.push({
            filename,
            mimeType: String(a.contentType ?? "application/octet-stream"),
            size: content.length,
            hash,
            content,
          });
        }

        const looksRelevant = SUBJECT_HINTS.test(subject) || SUBJECT_HINTS.test(textBody.slice(0, 1000));
        if (attachments.length === 0 && !looksRelevant) continue;

        result.push({
          messageId: parsed.messageId ?? `uid:${uid}`,
          from,
          subject,
          date: parsed.date ?? null,
          textBody,
          attachments,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  return result;
}
