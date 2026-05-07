import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightLeft, History, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

type Manager = { id: string; full_name: string };

export type TransferHistoryEntry = {
  from_manager_id: string | null;
  from_manager_name: string | null;
  to_manager_id: string;
  to_manager_name: string;
  transferred_by_user_id: string | null;
  transferred_by_name: string | null;
  reason: string | null;
  at: string;
};

export function TransferClientDialog({
  clientId,
  clientName,
  currentManagerId,
  managers,
  history,
  extraAttrs,
}: {
  clientId: string;
  clientName: string;
  currentManagerId: string | null;
  managers: Manager[];
  history: TransferHistoryEntry[];
  extraAttrs: Record<string, unknown>;
}) {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [toManagerId, setToManagerId] = useState<string>("");
  const [reason, setReason] = useState("");

  const currentManagerName = useMemo(
    () => managers.find((m) => m.id === currentManagerId)?.full_name ?? null,
    [managers, currentManagerId],
  );

  const candidates = useMemo(
    () => managers.filter((m) => m.id !== currentManagerId),
    [managers, currentManagerId],
  );

  const transferMut = useMutation({
    mutationFn: async () => {
      if (!toManagerId) throw new Error("Выберите менеджера");
      if (toManagerId === currentManagerId) throw new Error("Тот же самый менеджер уже закреплён");

      const toName = managers.find((m) => m.id === toManagerId)?.full_name ?? null;

      const entry: TransferHistoryEntry = {
        from_manager_id: currentManagerId ?? null,
        from_manager_name: currentManagerName,
        to_manager_id: toManagerId,
        to_manager_name: toName ?? "",
        transferred_by_user_id: user?.id ?? null,
        transferred_by_name: profile?.full_name ?? user?.email ?? null,
        reason: reason.trim() || null,
        at: new Date().toISOString(),
      };

      const nextExtra: Record<string, unknown> = {
        ...extraAttrs,
        assigned_manager_id: toManagerId,
        transfer_history: [...history, entry],
        last_edited_by_user_id: user?.id ?? null,
        last_edited_at: entry.at,
      };

      const { error } = await supabase
        .from("clients")
        .update({ extra_attrs: nextExtra as never })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Клиент передан другому менеджеру");
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      setOpen(false);
      setToManagerId("");
      setReason("");
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось передать клиента"),
  });

  const undoMut = useMutation({
    mutationFn: async () => {
      if (history.length === 0) throw new Error("История пуста");
      const last = history[history.length - 1];
      const revertedTo = last.from_manager_id;
      const revertedToName = last.from_manager_name;

      const entry: TransferHistoryEntry = {
        from_manager_id: last.to_manager_id,
        from_manager_name: last.to_manager_name,
        to_manager_id: revertedTo ?? "",
        to_manager_name: revertedToName ?? "",
        transferred_by_user_id: user?.id ?? null,
        transferred_by_name: profile?.full_name ?? user?.email ?? null,
        reason: `Отмена передачи от ${new Date(last.at).toLocaleString("ru-RU")}`,
        at: new Date().toISOString(),
      };

      const nextExtra: Record<string, unknown> = {
        ...extraAttrs,
        assigned_manager_id: revertedTo,
        transfer_history: [...history, entry],
        last_edited_by_user_id: user?.id ?? null,
        last_edited_at: entry.at,
      };

      const { error } = await supabase
        .from("clients")
        .update({ extra_attrs: nextExtra as never })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Последняя передача отменена");
      qc.invalidateQueries({ queryKey: ["client", clientId] });
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось отменить передачу"),
  });

  const lastEntry = history[history.length - 1];
  const canUndo = Boolean(lastEntry);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ArrowRightLeft className="mr-2 h-4 w-4" />
          Передать клиента другому менеджеру
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Передача клиента</DialogTitle>
          <DialogDescription>
            «{clientName}» — текущий менеджер:{" "}
            <span className="font-medium">{currentManagerName ?? "не назначен"}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label>Новый менеджер *</Label>
            <Select value={toManagerId} onValueChange={setToManagerId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите менеджера" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Причина передачи (необязательно)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Напр.: смена зоны ответственности"
              rows={2}
              maxLength={1000}
            />
          </div>

          {history.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4" /> История передач ({history.length})
                </div>
                {canUndo && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => undoMut.mutate()}
                    disabled={undoMut.isPending}
                  >
                    <Undo2 className="mr-1 h-3.5 w-3.5" />
                    {undoMut.isPending ? "Отмена…" : "Отменить последнюю"}
                  </Button>
                )}
              </div>
              <ul className="max-h-40 space-y-1.5 overflow-y-auto text-xs">
                {[...history].reverse().map((h, i) => (
                  <li key={i} className="border-l-2 border-border pl-2">
                    <div>
                      <span className="text-muted-foreground">
                        {new Date(h.at).toLocaleString("ru-RU")}
                      </span>
                    </div>
                    <div>
                      {h.from_manager_name ?? "—"} →{" "}
                      <span className="font-medium">{h.to_manager_name}</span>
                    </div>
                    <div className="text-muted-foreground">
                      Передал: {h.transferred_by_name ?? "—"}
                      {h.reason ? ` · ${h.reason}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button
            onClick={() => transferMut.mutate()}
            disabled={transferMut.isPending || !toManagerId}
          >
            {transferMut.isPending ? "Передача…" : "Передать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
