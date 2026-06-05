// Утилиты для построения кликабельных ссылок на каналы связи.
// Никаких внешних запросов — работает в РФ без VPN.

function digitsOnly(s: string): string {
  return s.replace(/\D+/g, "");
}

/** tel: ссылка из произвольного телефона. Возвращает null, если строка пустая. */
export function telHref(phone?: string | null): string | null {
  if (!phone) return null;
  const d = digitsOnly(phone);
  if (!d) return null;
  // Российские номера — приводим к +7.
  if (d.length === 11 && (d.startsWith("7") || d.startsWith("8"))) {
    return `tel:+7${d.slice(1)}`;
  }
  if (d.length === 10) return `tel:+7${d}`;
  return `tel:+${d}`;
}

/** WhatsApp ссылка. Принимает либо номер, либо готовую ссылку. */
export function whatsappHref(value?: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith("http")) return v;
  const d = digitsOnly(v);
  if (!d) return null;
  const normalized =
    d.length === 11 && d.startsWith("8") ? `7${d.slice(1)}` : d;
  return `https://wa.me/${normalized}`;
}

/** Telegram ссылка. Принимает username, @username, t.me/... или https://t.me/... */
export function telegramHref(value?: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith("http")) return v;
  if (v.startsWith("t.me/")) return `https://${v}`;
  const username = v.replace(/^@/, "");
  if (!username) return null;
  return `https://t.me/${username}`;
}

/** Max Messenger ссылка. Принимает Max ID или полную ссылку. */
export function maxMessengerHref(value?: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith("http")) return v;
  if (v.startsWith("max.ru/")) return `https://${v}`;
  return `https://max.ru/${v.replace(/^@/, "")}`;
}

/** mailto: ссылка. */
export function emailHref(value?: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v || !v.includes("@")) return null;
  return `mailto:${v}`;
}
