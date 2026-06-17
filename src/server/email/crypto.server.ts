// AES-256-GCM шифрование SMTP-паролей перевозчика.
// EMAIL_ENCRYPTION_KEY должен быть 32 байта в hex (64 hex-символа) или base64.
// Если ключа нет — функции бросают понятную ошибку, password не сохраняется.

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

export class EmailEncryptionKeyMissing extends Error {
  constructor() {
    super(
      "EMAIL_ENCRYPTION_KEY не задан в окружении сервера. " +
        "Без ключа SMTP-пароль перевозчика не может быть сохранён.",
    );
    this.name = "EmailEncryptionKeyMissing";
  }
}

function getKey(): Buffer {
  const raw = process.env.EMAIL_ENCRYPTION_KEY?.trim();
  if (!raw) throw new EmailEncryptionKeyMissing();
  // hex
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  // base64
  const buf = Buffer.from(raw, "base64");
  if (buf.length === 32) return buf;
  // raw utf8 fallback (slice/pad to 32)
  const utf = Buffer.from(raw, "utf8");
  if (utf.length === 32) return utf;
  throw new Error(
    "EMAIL_ENCRYPTION_KEY должен быть 32 байта (64 hex или 44 base64).",
  );
}

/** Возвращает строку формата `v1:<iv-base64>:<tag-base64>:<ct-base64>`. */
export function encryptPassword(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptPassword(blob: string): string {
  const key = getKey();
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Невалидный формат зашифрованного SMTP-пароля");
  }
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ct = Buffer.from(parts[3], "base64");
  const dec = createDecipheriv("aes-256-gcm", key, iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(ct), dec.final()]).toString("utf8");
}
