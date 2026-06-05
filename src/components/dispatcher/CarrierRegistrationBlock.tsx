import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Copy, RefreshCcw, Ban, LinkIcon } from "lucide-react";
import {
  invitesApi,
  dispatcherInviteUrl,
  type InviteTokenDTO,
} from "@/lib/dispatcher/invites";

interface Props {
  carrierId: string;
  /** Если у перевозчика уже есть commission_agreed_at, считаем анкету отправленной. */
  formSubmittedAt: string | null;
}

type RegState =
  | "never"
  | "active"
  | "submitted"
  | "used"
  | "revoked"
  | "expired";

function classify(rows: InviteTokenDTO[], formSubmittedAt: string | null) {
  if (rows.length === 0) {
    return { state: "never" as RegState, active: null as InviteTokenDTO | null, last: null as InviteTokenDTO | null };
  }
  const now = Date.now();
  const active = rows.find(
    (r) =>
      !r.used_at &&
      !r.revoked_at &&
      (!r.expires_at || new Date(r.expires_at).getTime() > now),
  );
  const last = rows[0];
  if (active) return { state: "active" as RegState, active, last };
  // если есть commission_agreed_at — анкета подтверждена
  if (formSubmittedAt) return { state: "submitted" as RegState, active: null, last };
  if (last.used_at) return { state: "used" as RegState, active: null, last };
  if (last.revoked_at) return { state: "revoked" as RegState, active: null, last };
  return { state: "expired" as RegState, active: null, last };
}

const STATE_LABEL: Record<RegState, string> = {
  never: "Ссылка не отправлялась",
  active: "Ссылка активна",
  submitted: "Анкета отправлена",
  used: "Ссылка использована",
  revoked: "Ссылка отозвана",
  expired: "Ссылка истекла",
};

const STATE_VARIANT: Record<RegState, "default" | "secondary" | "destructive" | "outline"> = {
  never: "outline",
  active: "default",
  submitted: "default",
  used: "secondary",
  revoked: "destructive",
  expired: "secondary",
};

function fmt(d: string | null | undefined) {
  return d ? new Date(d).toLocaleString("ru-RU") : "—";
}

export function CarrierRegistrationBlock({ carrierId, formSubmittedAt }: Props) {
  const [rows, setRows] = useState<InviteTokenDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await invitesApi.list({ entity_type: "carrier", entity_id: carrierId });
      setRows(res.rows ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки ссылок");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrierId]);

  const { state, active, last } = classify(rows, formSubmittedAt);

  const create = async () => {
    setBusy(true);
    try {
      await invitesApi.create({
        invite_type: "carrier_registration",
        related_entity_type: "carrier",
        related_entity_id: carrierId,
        expires_in_days: 14,
      });
      toast.success("Ссылка создана");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Отозвать ссылку?")) return;
    setBusy(true);
    try {
      await invitesApi.revoke(id);
      toast.success("Ссылка отозвана");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const copy = (token: string) => {
    void navigator.clipboard
      .writeText(dispatcherInviteUrl(token))
      .then(() => toast.success("Ссылка скопирована"))
      .catch(() => toast.error("Не удалось скопировать"));
  };

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LinkIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Регистрация по ссылке</span>
        </div>
        <Badge variant={STATE_VARIANT[state]}>{STATE_LABEL[state]}</Badge>
      </div>

      {loading && <div className="text-xs text-muted-foreground">Загрузка…</div>}

      {!loading && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {formSubmittedAt && <div>Анкета отправлена: {fmt(formSubmittedAt)}</div>}
          {last?.used_at && <div>Использована: {fmt(last.used_at)}</div>}
          {last?.revoked_at && <div>Отозвана: {fmt(last.revoked_at)}</div>}
          {active?.expires_at && <div>Активна до: {fmt(active.expires_at)}</div>}
        </div>
      )}

      {active && (
        <div className="flex gap-2">
          <Input
            readOnly
            value={dispatcherInviteUrl(active.token)}
            className="font-mono text-xs"
          />
          <Button type="button" size="sm" variant="secondary" onClick={() => copy(active.token)}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" size="sm" variant="outline" onClick={create} disabled={busy}>
          <RefreshCcw className="h-4 w-4 mr-1" />
          {active ? "Создать новую" : "Создать ссылку"}
        </Button>
        {active && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => revoke(active.id)}
            disabled={busy}
          >
            <Ban className="h-4 w-4 mr-1" />
            Отозвать
          </Button>
        )}
      </div>
    </div>
  );
}
