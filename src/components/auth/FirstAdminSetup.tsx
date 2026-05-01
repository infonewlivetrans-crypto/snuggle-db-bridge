import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/BrandLogo";
import { bootstrapFirstAdminFn } from "@/lib/server-functions/users.functions";
import { supabase } from "@/integrations/supabase/client";

export function FirstAdminSetup({ onCreated }: { onCreated: () => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== password2) {
      setError("Пароли не совпадают");
      return;
    }
    if (password.length < 6) {
      setError("Пароль должен быть не короче 6 символов");
      return;
    }
    setBusy(true);
    try {
      await bootstrapFirstAdminFn({
        data: { email: email.trim(), password, fullName: fullName.trim() },
      });
      // Сразу входим под только что созданным админом
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать администратора");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="mb-6 flex justify-center">
          <BrandLogo size={40} />
        </div>
        <h1 className="text-center text-xl font-bold text-foreground">
          Создание администратора
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Первый запуск системы. Создайте учётную запись администратора.
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="fullName">ФИО</Label>
            <Input
              id="fullName"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Иванов Иван Иванович"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@company.ru"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password2">Подтверждение пароля</Label>
            <Input
              id="password2"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
            />
          </div>
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Создание…" : "Создать администратора"}
          </Button>
        </form>
      </div>
    </div>
  );
}
