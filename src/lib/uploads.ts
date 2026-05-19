import { supabase } from "@/integrations/supabase/client";
import { storageFileApiUrl } from "@/lib/storageUrls";

export type UploadedStorageFile = {
  bucket: string;
  path: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  apiUrl: string;
  file_url: string;
};

/** Загружает файл в bucket и возвращает метаданные + URL через API приложения. */
export async function uploadPublicFile(
  bucket: string,
  file: File,
  prefix = "",
): Promise<UploadedStorageFile> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${prefix}${prefix ? "/" : ""}${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  const apiUrl = storageFileApiUrl(bucket, path);
  return {
    bucket,
    path,
    storage_path: path,
    file_name: file.name || path.split("/").pop() || "file",
    mime_type: file.type || "application/octet-stream",
    apiUrl,
    file_url: apiUrl,
  };
}
