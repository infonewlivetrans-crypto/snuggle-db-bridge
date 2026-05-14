// IndexedDB-хранилище для офлайн-фото водителя.
// Хранит blob файла + метаданные + статус (pending/uploading/error/uploaded).

const DB_NAME = "driver-offline-photos";
const STORE = "photos";
const DB_VERSION = 1;

export type PhotoUploadStatus = "pending" | "uploading" | "error" | "uploaded";

export type OfflinePhotoRecord = {
  client_upload_id: string; // PK, уникальный device-side
  route_point_id: string;
  order_id: string | null;
  kind: string;
  actor: string | null;
  file_name: string;
  mime_type: string;
  size: number;
  blob: Blob;
  device_created_at: string;
  status: PhotoUploadStatus;
  error?: string | null;
  attempts: number;
  last_attempt_at?: number | null;
  // После успешной отправки:
  file_url?: string | null;
  storage_path?: string | null;
};

export type OfflinePhotoMeta = Omit<OfflinePhotoRecord, "blob"> & { blob_size: number };

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!isBrowser()) return Promise.reject(new Error("IndexedDB недоступен"));
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "client_upload_id" });
        os.createIndex("by_route_point", "route_point_id", { unique: false });
        os.createIndex("by_status", "status", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB error"));
  });
  return _dbPromise;
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDB().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

function emitChange() {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent("driver-offline-photos:changed"));
}

export async function putPhoto(rec: OfflinePhotoRecord): Promise<void> {
  const store = await tx("readwrite");
  await new Promise<void>((resolve, reject) => {
    const r = store.put(rec);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
  emitChange();
}

export async function getPhoto(clientUploadId: string): Promise<OfflinePhotoRecord | null> {
  const store = await tx("readonly");
  return new Promise((resolve, reject) => {
    const r = store.get(clientUploadId);
    r.onsuccess = () => resolve((r.result as OfflinePhotoRecord) ?? null);
    r.onerror = () => reject(r.error);
  });
}

export async function deletePhoto(clientUploadId: string): Promise<void> {
  const store = await tx("readwrite");
  await new Promise<void>((resolve, reject) => {
    const r = store.delete(clientUploadId);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
  emitChange();
}

export async function listPhotosByRoutePoint(
  routePointId: string,
): Promise<OfflinePhotoRecord[]> {
  const store = await tx("readonly");
  return new Promise((resolve, reject) => {
    const idx = store.index("by_route_point");
    const req = idx.getAll(routePointId);
    req.onsuccess = () => resolve((req.result as OfflinePhotoRecord[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function listPendingPhotos(): Promise<OfflinePhotoRecord[]> {
  const store = await tx("readonly");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const all = (req.result as OfflinePhotoRecord[]) ?? [];
      resolve(all.filter((p) => p.status === "pending" || p.status === "error"));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function updatePhoto(
  clientUploadId: string,
  patch: Partial<OfflinePhotoRecord>,
): Promise<void> {
  const existing = await getPhoto(clientUploadId);
  if (!existing) return;
  await putPhoto({ ...existing, ...patch });
}

export function subscribePhotos(listener: () => void): () => void {
  if (!isBrowser()) return () => {};
  const onChange = () => listener();
  window.addEventListener("driver-offline-photos:changed", onChange);
  return () => window.removeEventListener("driver-offline-photos:changed", onChange);
}

// Лимиты офлайн-хранилища фото.
export const OFFLINE_PHOTO_MAX_COUNT = 200;
export const OFFLINE_PHOTO_MAX_BYTES = 200 * 1024 * 1024; // 200 МБ
export const OFFLINE_PHOTO_MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 МБ на 1 фото

async function listAllPhotos(): Promise<OfflinePhotoRecord[]> {
  const store = await tx("readonly");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as OfflinePhotoRecord[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflinePhotoUsage(): Promise<{ count: number; bytes: number }> {
  const all = await listAllPhotos().catch(() => [] as OfflinePhotoRecord[]);
  let bytes = 0;
  for (const p of all) bytes += p.size || 0;
  return { count: all.length, bytes };
}

/**
 * Удаляет самые старые УСПЕШНО ОТПРАВЛЕННЫЕ фото, затем — самые старые pending/error,
 * пока не уложимся в лимиты count/bytes. Записи в статусе "uploading" не трогаем.
 * Возвращает число удалённых.
 */
export async function enforceOfflinePhotoQuota(
  extraBytes = 0,
  extraCount = 0,
): Promise<number> {
  const all = await listAllPhotos().catch(() => [] as OfflinePhotoRecord[]);
  let totalBytes = all.reduce((s, p) => s + (p.size || 0), 0) + extraBytes;
  let totalCount = all.length + extraCount;
  if (totalBytes <= OFFLINE_PHOTO_MAX_BYTES && totalCount <= OFFLINE_PHOTO_MAX_COUNT) {
    return 0;
  }
  const byAge = (a: OfflinePhotoRecord, b: OfflinePhotoRecord) =>
    (a.device_created_at || "").localeCompare(b.device_created_at || "");
  const uploaded = all.filter((p) => p.status === "uploaded").sort(byAge);
  const others = all
    .filter((p) => p.status === "pending" || p.status === "error")
    .sort(byAge);
  const victims = [...uploaded, ...others];
  let removed = 0;
  for (const v of victims) {
    if (totalBytes <= OFFLINE_PHOTO_MAX_BYTES && totalCount <= OFFLINE_PHOTO_MAX_COUNT) break;
    try {
      await deletePhoto(v.client_upload_id);
      totalBytes -= v.size || 0;
      totalCount -= 1;
      removed += 1;
    } catch {
      /* ignore */
    }
  }
  return removed;
}

export function newClientUploadId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${rand}`;
}

export function blobToObjectURL(blob: Blob): string {
  return URL.createObjectURL(blob);
}
