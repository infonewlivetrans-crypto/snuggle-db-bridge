export type StorageFileDescriptor = {
  bucket?: string | null;
  path?: string | null;
  storage_path?: string | null;
  file_url?: string | null;
};

export function storageFileApiUrl(bucket: string, path: string): string {
  return `/api/storage-file?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`;
}

export function extractStorageObjectFromUrl(
  value: string | null | undefined,
): { bucket: string; path: string } | null {
  if (!value) return null;

  try {
    const apiUrl = new URL(value, "https://local.invalid");
    if (apiUrl.pathname === "/api/storage-file") {
      const bucket = apiUrl.searchParams.get("bucket");
      const path = apiUrl.searchParams.get("path");
      if (bucket && path) return { bucket, path };
    }
  } catch {
    /* ignore */
  }

  const legacyMatch = value.match(
    /\/storage\/v1\/object\/(?:public|sign)\/([^/?#]+)\/([^?#]+)/,
  );
  if (!legacyMatch?.[1] || !legacyMatch[2]) return null;

  try {
    return {
      bucket: decodeURIComponent(legacyMatch[1]),
      path: decodeURIComponent(legacyMatch[2]),
    };
  } catch {
    return { bucket: legacyMatch[1], path: legacyMatch[2] };
  }
}

export function resolveStorageObject(
  file: StorageFileDescriptor,
  fallbackBucket?: string,
): { bucket: string; path: string } | null {
  const directPath = file.path ?? file.storage_path ?? null;
  if (directPath) {
    const bucket = file.bucket ?? fallbackBucket;
    return bucket ? { bucket, path: directPath } : null;
  }
  const fromUrl = extractStorageObjectFromUrl(file.file_url);
  if (fromUrl) return fromUrl;
  return null;
}

export function frontendStorageUrl(
  file: StorageFileDescriptor,
  fallbackBucket?: string,
): string | null {
  const object = resolveStorageObject(file, fallbackBucket);
  return object ? storageFileApiUrl(object.bucket, object.path) : null;
}