import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/auth-context";

type Props = {
  /** Что удаляем — для текста диалога. */
  entityLabel: string;
  /** Номер, который admin должен ввести для подтверждения (например, № заказа/заявки/рейса). */
  confirmationCode: string;
  /** DELETE URL, например /api/orders/<id>. */
  deleteUrl: string;
  /** Колбэк после успешного удаления (например, redirect или refetch). */
  onDeleted?: () => void;
  /** Доп. описание ограничений (когда и почему может не получиться). */
  description?: string;
  /** Размер/вариант кнопки. */
  size?: "sm" | "default" | "icon";
  variant?: "destructive" | "ghost" | "outline";
  /** Отображать только иконку. */
  iconOnly?: boolean;
};

/**
 * Кнопка удаления с диалогом подтверждения и обязательным вводом номера сущности.
 * Видна только пользователям с ролью admin.
 */
export function AdminDeleteButton({
  entityLabel,
  confirmationCode,
  deleteUrl,
  onDeleted,
  description,
  size = "sm",
  variant = "destructive",
  iconOnly = false,
}: Props) {
  const { roles } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  if (!roles.includes("admin")) return null;

  const match = typed.trim() === confirmationCode.trim();

  async function handleDelete() {
    if (!match || busy) return;
    setBusy(true);
    try {
      const res = await fetch(deleteUrl, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload?.error ?? "Не удалось удалить");
        setBusy(false);
        return;
      }
      toast.success(`Удалено: ${entityLabel} ${confirmationCode}`);
      setOpen(false);
      setTyped("");
      onDeleted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Сетевая ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`Удалить ${entityLabel} ${confirmationCode}`}
      >
        <Trash2 className={iconOnly ? "h-4 w-4" : "mr-1.5 h-4 w-4"} />
        {!iconOnly && "Удалить"}
      </Button>

      <AlertDialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); if (!o) setTyped(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить {entityLabel} {confirmationCode}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Действие необратимо. Связанные данные (точки маршрута, позиции,
                  сообщения) тоже будут удалены.
                </p>
                {description && (
                  <p className="text-muted-foreground">{description}</p>
                )}
                <p>
                  Для подтверждения введите номер{" "}
                  <span className="font-mono font-semibold">{confirmationCode}</span>:
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="admin-delete-confirm" className="sr-only">
              Подтверждение
            </Label>
            <Input
              id="admin-delete-confirm"
              autoFocus
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmationCode}
              disabled={busy}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={!match || busy}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
