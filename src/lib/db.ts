/**
 * Тонкая обёртка вокруг supabase для таблиц, которых ещё нет в сгенерированных
 * типах. Возвращает `any`-подобный билдер, чтобы не ломать сборку.
 */
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as unknown as { from: (table: string) => any };
