// SMTP-отправка через nodemailer от имени перевозчика.
// Использует расшифрованный SMTP-пароль (никогда не возвращается на клиент).

import nodemailer from "nodemailer";
import dns from "node:dns";

// Mail.ru и часть провайдеров отдают AAAA-записи, до которых из Worker нет IPv6
// маршрута (ENETUNREACH 2a00:...). Принудительно используем IPv4 в DNS-резолве.
try {
  dns.setDefaultResultOrder?.("ipv4first");
} catch {
  /* old node, ignore */
}

export interface SmtpAccount {
  email: string;
  from_name: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean; // true = SSL/TLS, false = STARTTLS
  smtp_user: string;
  smtp_password: string; // расшифрованный!
}

export interface SendEmailInput {
  account: SmtpAccount;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

function buildTransport(acc: SmtpAccount) {
  // family:4 — IPv4-only, иначе на части провайдеров (mail.ru) валится ENETUNREACH.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return nodemailer.createTransport({
    host: acc.smtp_host,
    port: acc.smtp_port,
    secure: acc.smtp_secure,
    auth: { user: acc.smtp_user, pass: acc.smtp_password },
    requireTLS: !acc.smtp_secure,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    family: 4,
  } as any);
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { account, to, cc, subject, text, replyTo } = input;
  if (!to.length) return { ok: false, error: "Пустой список получателей" };
  try {
    const tx = buildTransport(account);
    const from = account.from_name
      ? `"${account.from_name.replace(/"/g, "")}" <${account.email}>`
      : account.email;
    const info = await tx.sendMail({
      from,
      to,
      cc: cc?.length ? cc : undefined,
      replyTo: replyTo ?? account.email,
      subject,
      text,
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function verifySmtp(account: SmtpAccount): Promise<SendEmailResult> {
  try {
    const tx = buildTransport(account);
    await tx.verify();
    // Отправляем тестовое письмо самому себе.
    return await sendEmail({
      account,
      to: [account.email],
      subject: "Radius Track: проверка подключения SMTP",
      text:
        "Это автоматическое тестовое письмо от Radius Track.\n\n" +
        "Если вы получили его — SMTP подключён правильно и сервис сможет " +
        "отправлять данные грузовладельцу от вашего имени.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
