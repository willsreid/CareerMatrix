/**
 * Image storage for the portfolio.
 *
 * Images cannot go in `localStorage` with everything else: the whole origin gets about
 * 5 MB, and one phone photo is 3 of them. So image bytes live in IndexedDB — still
 * local, still no server, but with the much larger quota and binary storage rather
 * than base64-in-a-string (which inflates every byte by a third).
 *
 * The portfolio document itself stays in `localStorage` and refers to images by id, so
 * the two can be backed up or cleared independently.
 */

const DB_NAME = "career-matrix";
const DB_VERSION = 1;
const STORE = "portfolio-images";

export interface StoredImage {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
  bytes: number;
  blob: Blob;
  createdAt: string;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the image store."));
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Image store request failed."));
        transaction.oncomplete = () => db.close();
      }),
  );
}

export const imageStore = {
  async put(image: StoredImage): Promise<void> {
    if (!hasIndexedDb()) return;
    await run("readwrite", (store) => store.put(image) as IDBRequest<IDBValidKey>);
  },

  async get(id: string): Promise<StoredImage | undefined> {
    if (!hasIndexedDb()) return undefined;
    return run<StoredImage | undefined>("readonly", (store) => store.get(id));
  },

  async list(): Promise<StoredImage[]> {
    if (!hasIndexedDb()) return [];
    const all = await run<StoredImage[]>("readonly", (store) => store.getAll() as IDBRequest<StoredImage[]>);
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async remove(id: string): Promise<void> {
    if (!hasIndexedDb()) return;
    await run("readwrite", (store) => store.delete(id) as unknown as IDBRequest<undefined>);
  },

  async clear(): Promise<void> {
    if (!hasIndexedDb()) return;
    await run("readwrite", (store) => store.clear() as unknown as IDBRequest<undefined>);
  },

  /** Total bytes on disk, for the storage summary on the profile page. */
  async usage(): Promise<{ count: number; bytes: number }> {
    const all = await this.list();
    return { count: all.length, bytes: all.reduce((sum, image) => sum + (image.bytes || 0), 0) };
  },
};

/**
 * Turns a stored blob into a data URL for the PDF renderer.
 *
 * react-pdf takes either a URL or a data URI for `Image`; a data URI is what keeps the
 * export self-contained, since the PDF has to carry the pixels regardless.
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the image."));
    reader.readAsDataURL(blob);
  });
}

export async function loadImageDataUrl(id: string): Promise<string | null> {
  const image = await imageStore.get(id);
  if (!image) return null;
  return blobToDataUrl(image.blob);
}
