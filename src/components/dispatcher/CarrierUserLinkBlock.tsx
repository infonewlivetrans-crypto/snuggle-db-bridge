import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Link2, Unlink, UserCheck, UserPlus, Copy, RefreshCw, Mail, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { apiGetAuth, apiPost, apiDelete } from "@/lib/api-client";

type LinkInfo = {
  link: { id: string; user_id: string; status: string; created_at: string } | null;
  profile: { user_id: string; full_name: string | null; email: string | null; phone: string | null } | null;
};

type CarrierUserRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  linked_ext_id: string | null;
};

/**
 * Блок «Пользователь кабинета перевозчика» в карточке dispatcher_carrier_ext.
 * Позволяет admin/dispatcher привязать существующего пользователя с ролью
 * `carrier` к этой карточке, чтобы заработал /carrier и API кабинета.
 */
export function CarrierUserLinkBlock({ carrierExtId }: { carrierExtId: string }) {
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiGetAuth<{ ok: boolean } & LinkInfo>(
        `/api/dispatcher/carrier-link?ext_id=${encodeURIComponent(carrierExtId)}`,
        10000,
      );
      setInfo({ link: r.link ?? null, profile: r.profile ?? null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить связь");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [carrierExtId]);

  const unlink = async () => {
    if (!confirm("Отвязать пользователя от карточки перевозчика?")) return;
    try {
      await apiDelete(`/api/dispatcher/carrier-link?ext_id=${encodeURIComponent(carrierExtId)}`);
      toast.success("Связь отменена");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">Пользователь кабинета перевозчика</span>
        {info?.link ? (
          <Badge variant="default" className="gap-1">
            <UserCheck className="h-3 w-3" /> Связан
          </Badge>
        ) : (
          <Badge variant="outline">Не связан</Badge>
        )}
      </div>

      {loading ? (
        <div className="flex items-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
        </div>
      ) : info?.link ? (
        <div className="space-y-1 text-sm">
          <Row k="ФИО / контакт" v={info.profile?.full_name} />
          <Row k="Email" v={info.profile?.email} />
          <Row k="Телефон" v={info.profile?.phone} />
          <Row k="user_id" v={info.link.user_id} mono />
          <div className="pt-2">
            <Button size="sm" variant="outline" onClick={unlink}>
              <Unlink className="mr-1 h-4 w-4" /> Отвязать
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Кабинет перевозчика заработает только после привязки пользователя с ролью «Перевозчик».
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <Link2 className="mr-1 h-4 w-4" /> Связать пользователя
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
              <UserPlus className="mr-1 h-4 w-4" /> Создать пользователя перевозчика
            </Button>
          </div>
        </div>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Связать пользователя</DialogTitle>
            <DialogDescription>
              Выберите пользователя с ролью «Перевозчик», которому нужно открыть этот кабинет.
            </DialogDescription>
          </DialogHeader>
          <CarrierUserPicker
            extId={carrierExtId}
            onLinked={async () => {
              setPickerOpen(false);
              await load();
            }}
          />
        </DialogContent>
      </Dialog>

      <CreateCarrierUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        extId={carrierExtId}
        onCreated={load}
      />
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/40 pb-1 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{k}</span>
      <span className={mono ? "font-mono text-xs" : "font-medium"}>
        {v && v.length > 0 ? v : "—"}
      </span>
    </div>
  );
}

function CarrierUserPicker({
  extId,
  onLinked,
}: {
  extId: string;
  onLinked: () => void | Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CarrierUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await apiGetAuth<{ rows: CarrierUserRow[] }>(
          `/api/dispatcher/carrier-link/users?search=${encodeURIComponent(search)}`,
          10000,
        );
        if (!cancelled) setRows(r.rows ?? []);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Ошибка");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search]);

  const link = async (userId: string) => {
    setLinkingId(userId);
    try {
      await apiPost("/api/dispatcher/carrier-link", { ext_id: extId, user_id: userId });
      toast.success("Пользователь привязан");
      await onLinked();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <Input
        autoFocus
        placeholder="Поиск: ФИО, email, телефон"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Поиск…
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div className="text-sm text-muted-foreground">
            {search
              ? "Нет пользователей-перевозчиков по этому запросу."
              : "Пользователей-перевозчиков пока нет. Создайте нового пользователя."}
          </div>
        )}
        {rows.map((u) => {
          const alreadyHere = u.linked_ext_id === extId;
          const linkedElsewhere = !!u.linked_ext_id && !alreadyHere;
          return (
            <div
              key={u.user_id}
              className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{u.full_name || u.email || u.user_id}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {u.email ?? "—"} · {u.phone ?? "—"}
                </div>
                {linkedElsewhere && (
                  <div className="text-xs text-amber-600">Уже привязан к другому перевозчику</div>
                )}
                {alreadyHere && <div className="text-xs text-green-600">Уже связан с этой карточкой</div>}
              </div>
              <Button
                size="sm"
                disabled={alreadyHere || linkingId === u.user_id}
                onClick={() => link(u.user_id)}
              >
                {linkingId === u.user_id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Link2 className="mr-1 h-4 w-4" /> Связать
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function genPassword(len = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const cryptoObj = typeof crypto !== "undefined" ? crypto : undefined;
  if (cryptoObj?.getRandomValues) {
    const arr = new Uint32Array(len);
    cryptoObj.getRandomValues(arr);
    for (let i = 0; i < len; i++) out += alphabet[arr[i] % alphabet.length];
  } else {
    for (let i = 0; i < len; i++)
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

type CreateResult = {
  user_id: string;
  email: string;
  phone: string | null;
  password: string;
};

function CreateCarrierUserDialog({
  open,
  onOpenChange,
  extId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  extId: string;
  onCreated: () => void | Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState(() => genPassword());
  const [linkNow, setLinkNow] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);

  // reset on open
  useEffect(() => {
    if (open) {
      setFullName(""); setEmail(""); setPhone("");
      setPassword(genPassword()); setLinkNow(true);
      setSubmitting(false); setResult(null);
    }
  }, [open]);

  const submit = async () => {
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      toast.error("Заполните ФИО, email и пароль (минимум 6 символов)");
      return;
    }
    setSubmitting(true);
    try {
      const r = await apiPost<{ user_id: string; email: string; phone: string | null; linked: boolean }>(
        "/api/dispatcher/carrier-link/create-user",
        {
          ext_id: extId,
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          password,
          link: linkNow,
        },
        15000,
      );
      setResult({ user_id: r.user_id, email: r.email, phone: r.phone, password });
      toast.success("Пользователь создан");
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось создать пользователя");
    } finally {
      setSubmitting(false);
    }
  };

  const copyAll = async () => {
    if (!result) return;
    const text =
      `Кабинет перевозчика — данные для входа\n` +
      `Email: ${result.email}\n` +
      (result.phone ? `Телефон: ${result.phone}\n` : "") +
      `Временный пароль: ${result.password}\n`;
    try { await navigator.clipboard.writeText(text); toast.success("Скопировано"); }
    catch { toast.error("Не удалось скопировать"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Создать пользователя перевозчика</DialogTitle>
          <DialogDescription>
            Аккаунт с ролью «Перевозчик» и доступом в кабинет /carrier.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">Email: </span><span className="font-medium">{result.email}</span></div>
              {result.phone && (
                <div><span className="text-muted-foreground">Телефон: </span><span className="font-medium">{result.phone}</span></div>
              )}
              <div><span className="text-muted-foreground">Временный пароль: </span><span className="font-mono">{result.password}</span></div>
            </div>
            <p className="text-xs text-muted-foreground">
              Передайте эти данные перевозчику для входа в кабинет. После закрытия окна пароль больше не отобразится.
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={copyAll}>
                <Copy className="mr-1 h-4 w-4" /> Скопировать
              </Button>
              <Button onClick={() => onOpenChange(false)}>Готово</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ccu-name">ФИО</Label>
              <Input id="ccu-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ccu-email">Email</Label>
              <Input id="ccu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ccu-phone">Телефон</Label>
              <Input id="ccu-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ccu-pass">Временный пароль</Label>
              <div className="flex gap-2">
                <Input id="ccu-pass" value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
                <Button type="button" variant="outline" onClick={() => setPassword(genPassword())} title="Сгенерировать">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={linkNow} onCheckedChange={(v) => setLinkNow(v === true)} />
              Сразу связать с этим перевозчиком
            </label>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Отмена
              </Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1 h-4 w-4" />}
                Создать
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

