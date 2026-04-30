// Генерация быстрого текста для сообщения клиенту о времени прибытия.
// Только локальная сборка строки + копирование. Никаких внешних интеграций.

import { formatTime } from "@/lib/eta";

export type ClientMessageInput = {
  orderNumber: string;
  etaAtIso: string | null;
  windowMinutes?: number; // ширина окна в каждую сторону
  isLateRisk: boolean;
  driverName?: string | null;
  driverPhone?: string | null;
};

export function buildClientEtaMessage(input: ClientMessageInput): string {
  const minutes = input.windowMinutes ?? 15;
  let fromStr = "—";
  let toStr = "—";
  if (input.etaAtIso) {
    const eta = new Date(input.etaAtIso);
    const from = new Date(eta.getTime() - minutes * 60_000);
    const to = new Date(eta.getTime() + minutes * 60_000);
    fromStr = formatTime(from.toISOString());
    toStr = formatTime(to.toISOString());
  }

  if (input.isLateRisk) {
    return (
      `Здравствуйте! По вашему заказу №${input.orderNumber} возможна задержка. ` +
      `Ориентировочное время прибытия: с ${fromStr} до ${toStr}.`
    );
  }

  const driver = input.driverName?.trim() || "уточняется";
  const phone = input.driverPhone?.trim() || "уточняется";
  return (
    `Здравствуйте! Ваш заказ №${input.orderNumber} ориентировочно прибудет ` +
    `с ${fromStr} до ${toStr}. Водитель: ${driver}. Телефон: ${phone}.`
  );
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback ниже
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
