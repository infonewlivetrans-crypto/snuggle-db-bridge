import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, ArrowLeft, Settings as SettingsIcon, Smartphone } from "lucide-react";
import { toast } from "sonner";
import {
  fetchAllSettings,
  fetchAllAppVersions,
  updateSetting,
  updateAppVersion,
  type SystemSetting,
  type AppVersion,
} from "@/lib/system-settings";
import { MODULE_LABELS, MODULE_DESCRIPTIONS, type ModuleKey, type EnabledModules, LAUNCH_MODE_LABELS, type LaunchMode } from "@/lib/modules";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettingsPage,
  loader: async () => {
    const [settings, versions] = await Promise.all([fetchAllSettings(), fetchAllAppVersions()]);
    return { settings, versions };
  },
  errorComponent: ({ error }) => (
    <div className="p-8 text-destructive">Ошибка загрузки: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8">Не найдено</div>,
});

function AdminSettingsPage() {
  const data = Route.useLoaderData();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/" search={{ orderId: undefined }}><ArrowLeft className="h-4 w-4" /> Назад</Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <SettingsIcon className="h-5 w-5" /> Системные настройки
            </h1>
            <p className="text-xs text-muted-foreground">
              Меняйте бизнес-правила без переустановки приложения
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Tabs defaultValue="modules">
          <TabsList>
            <TabsTrigger value="modules">Модули</TabsTrigger>
            <TabsTrigger value="settings">Настройки</TabsTrigger>
            <TabsTrigger value="versions">
              <Smartphone className="h-4 w-4 mr-1" /> Версии приложения
            </TabsTrigger>
          </TabsList>

          <TabsContent value="modules" className="mt-4 space-y-4">
            <LaunchModePanel items={data.settings} onChanged={() => router.invalidate()} />
            <ModuleTogglesPanel items={data.settings} onChanged={() => router.invalidate()} />
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <SettingsList items={data.settings} onChanged={() => router.invalidate()} />
          </TabsContent>

          <TabsContent value="versions" className="mt-4">
            <VersionsList items={data.versions} onChanged={() => router.invalidate()} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function ModuleTogglesPanel({
  items,
  onChanged,
}: {
  items: SystemSetting[];
  onChanged: () => void;
}) {
  const setting = items.find((s) => s.setting_key === "modules.enabled");
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  if (!setting) {
    return (
      <Card>
        <CardContent className="p-6 text-muted-foreground">
          Настройка модулей не найдена.
        </CardContent>
      </Card>
    );
  }

  const value = (setting.setting_value as Partial<EnabledModules>) ?? {};
  const keys: ModuleKey[] = ["warehouse", "supply", "accounting", "carriers", "onec", "excel_import"];

  const toggle = async (key: ModuleKey, next: boolean) => {
    setBusy(key);
    try {
      await updateSetting(setting.id, { ...value, [key]: next });
      toast.success(`${MODULE_LABELS[key]}: ${next ? "включён" : "выключен"}`);
      qc.invalidateQueries({ queryKey: ["modules.enabled"] });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Опциональные модули</CardTitle>
        <CardDescription>
          Если модуль выключен, его разделы скрываются из меню. Маршруты, склад
          и водитель продолжают работать независимо друг от друга.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {keys.map((k) => {
          const enabled = value[k] !== false;
          return (
            <div key={k} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="font-medium">{MODULE_LABELS[k]}</div>
                <div className="text-xs text-muted-foreground">
                  {MODULE_DESCRIPTIONS[k]}
                </div>
              </div>
              <Switch
                checked={enabled}
                disabled={busy === k}
                onCheckedChange={(v) => toggle(k, v)}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SettingsList({ items, onChanged }: { items: SystemSetting[]; onChanged: () => void }) {
  const grouped = useMemo(() => {
    const map = new Map<string, SystemSetting[]>();
    for (const s of items) {
      const arr = map.get(s.category) ?? [];
      arr.push(s);
      map.set(s.category, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  if (!items.length) {
    return <div className="text-muted-foreground">Настройки не найдены.</div>;
  }

  return (
    <div className="space-y-6">
      {grouped.map(([category, list]) => (
        <div key={category}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            {CATEGORY_LABELS[category] ?? category}
          </h2>
          <div className="grid gap-4">
            {list.map((s) => (
              <SettingEditor key={s.id} setting={s} onChanged={onChanged} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  driver: "Водитель",
  rules: "Правила доставки",
  limits: "Лимиты",
  notifications: "Уведомления",
  warehouse: "Склады",
  roles: "Роли",
  order: "Заказы",
  general: "Общие",
  modules: "Модули системы",
  gps: "GPS",
};

function SettingEditor({ setting, onChanged }: { setting: SystemSetting; onChanged: () => void }) {
  const [value, setValue] = useState<string>(() => JSON.stringify(setting.setting_value, null, 2));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setValue(JSON.stringify(setting.setting_value, null, 2));
  }, [setting.id, setting.updated_at]);

  const handleSave = async () => {
    setErr(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Невалидный JSON");
      return;
    }
    setBusy(true);
    try {
      await updateSetting(setting.id, parsed);
      toast.success("Настройка сохранена");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-mono">{setting.setting_key}</CardTitle>
        {setting.description && <CardDescription>{setting.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-2">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={Math.min(12, value.split("\n").length + 1)}
          className="font-mono text-xs"
        />
        {err && <p className="text-xs text-destructive">{err}</p>}
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            Обновлено: {new Date(setting.updated_at).toLocaleString("ru-RU")}
          </span>
          <Button size="sm" onClick={handleSave} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function VersionsList({ items, onChanged }: { items: AppVersion[]; onChanged: () => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((v) => (
        <VersionEditor key={v.id} version={v} onChanged={onChanged} />
      ))}
    </div>
  );
}

function VersionEditor({ version, onChanged }: { version: AppVersion; onChanged: () => void }) {
  const [form, setForm] = useState<AppVersion>(version);
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(version), [version.id, version.updated_at]);

  const handleSave = async () => {
    setBusy(true);
    try {
      await updateAppVersion(version.id, {
        current_version: form.current_version,
        minimum_required_version: form.minimum_required_version,
        force_update: form.force_update,
        update_message: form.update_message,
        app_store_url: form.app_store_url,
        play_market_url: form.play_market_url,
        release_notes: form.release_notes,
      });
      toast.success(`Версия ${version.platform} обновлена`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base capitalize">{version.platform}</CardTitle>
        <CardDescription>Управление версией для платформы {version.platform}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Текущая версия</Label>
            <Input
              value={form.current_version}
              onChange={(e) => setForm({ ...form, current_version: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Минимально допустимая</Label>
            <Input
              value={form.minimum_required_version}
              onChange={(e) => setForm({ ...form, minimum_required_version: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">Обязательное обновление</div>
            <p className="text-xs text-muted-foreground">Блокирует работу до обновления</p>
          </div>
          <Switch
            checked={form.force_update}
            onCheckedChange={(checked) => setForm({ ...form, force_update: checked })}
          />
        </div>

        <div>
          <Label className="text-xs">Сообщение пользователю</Label>
          <Textarea
            rows={2}
            value={form.update_message ?? ""}
            onChange={(e) => setForm({ ...form, update_message: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">App Store URL</Label>
            <Input
              value={form.app_store_url ?? ""}
              onChange={(e) => setForm({ ...form, app_store_url: e.target.value || null })}
            />
          </div>
          <div>
            <Label className="text-xs">Google Play URL</Label>
            <Input
              value={form.play_market_url ?? ""}
              onChange={(e) => setForm({ ...form, play_market_url: e.target.value || null })}
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">Заметки к релизу</Label>
          <Textarea
            rows={2}
            value={form.release_notes ?? ""}
            onChange={(e) => setForm({ ...form, release_notes: e.target.value || null })}
          />
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
