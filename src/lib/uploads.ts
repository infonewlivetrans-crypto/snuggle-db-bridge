import { supabase } from "@/integrations/supabase/client";

/** Загружает файл в публичный bucket и возвращает публичный URL. */
export async function uploadPublicFile(
  bucket: string,
  file: File,
  prefix = "",
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${prefix}${prefix ? "/" : ""}${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
