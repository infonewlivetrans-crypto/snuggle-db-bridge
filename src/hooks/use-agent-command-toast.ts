// Toast-статусы для команд Radius Track Browser Agent.
// Поллит статус конкретной команды до терминального состояния и
// показывает пошаговые уведомления. НИКАКОГО API ATI.
import { useCallback } from "react";
import { toast } from "sonner";
import { apiGetAuth } from "@/lib/api-client";
import type { AgentCommandRow } from "@/components/ai-dispatcher/AgentCommandStatusPanel";

type Options = {
  label: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
};

async function fetchCommand(id: string): Promise<AgentCommandRow | null> {
  try {
    const res = await apiGetAuth<{ row: AgentCommandRow }>(
      `/api/dispatcher/ai-dispatcher/agent/commands/${id}`);
    return res.row ?? null;
  } catch { return null; }
}

/**
 * Возвращает функцию, которая запускает apiCall (мутацию, возвращающую
 * `{ command_id?: string | null }`), показывает единый toast и обновляет его
 * по мере продвижения команды: queued → sent → acknowledged → completed/failed.
 * Никогда не показывает «успех» до фактического completed.
 */
export function useAgentCommandToast() {
  return useCallback(
    async <T extends { command_id?: string | null } | undefined | null>(
      apiCall: () => Promise<T>,
      opts: Options,
    ): Promise<T> => {
      const { label, timeoutMs = 45_000, pollIntervalMs = 2_000 } = opts;
      const toastId = toast.loading(`${label}: команда ожидает агента…`);
      let response: T;
      try {
        response = await apiCall();
      } catch (e) {
        toast.error(`${label}: ошибка запроса — ${(e as Error).message}`, { id: toastId });
        throw e;
      }
      const commandId = response?.command_id;
      // Mock / synchronous — сразу считаем успех.
      if (!commandId) {
        toast.success(`${label}: выполнено`, { id: toastId });
        return response;
      }
      toast.loading(`${label}: команда отправлена агенту`, { id: toastId });
      const started = Date.now();
      let lastStatus = "queued";
      while (Date.now() - started < timeoutMs) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        const row = await fetchCommand(commandId);
        if (!row) continue;
        if (row.status !== lastStatus) {
          lastStatus = row.status;
          if (row.status === "acknowledged") {
            toast.loading(`${label}: агент выполняет команду`, { id: toastId });
          } else if (row.status === "completed") {
            toast.success(`${label}: команда выполнена`, { id: toastId });
            return response;
          } else if (row.status === "failed") {
            toast.error(`${label}: ошибка агента — ${row.error_message ?? "unknown"}`, { id: toastId });
            return response;
          } else if (row.status === "expired") {
            toast.error(`${label}: команда истекла (агент не ответил)`, { id: toastId });
            return response;
          } else if (row.status === "cancelled") {
            toast.error(`${label}: команда отменена`, { id: toastId });
            return response;
          }
        }
      }
      toast.error(`${label}: превышено время ожидания агента`, { id: toastId });
      return response;
    },
    [],
  );
}
