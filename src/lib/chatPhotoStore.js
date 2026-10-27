// Keeps the photo of an unfinished report in IndexedDB so the report can be
// resumed after the tab is closed, the page is reloaded or the user leaves the chat.
const DB_NAME = 'civicchat';
const STORE = 'photos';
const KEY = 'active';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result ?? null);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function storePhoto(file, uid) {
  try {
    await run('readwrite', (s) => s.put({ blob: file, name: file.name || 'photo.jpg', type: file.type || 'image/jpeg', uid: uid || null, savedAt: Date.now() }, KEY));
  } catch {
    // Storage is best-effort
  }
}

export async function loadPhoto(uid) {
  try {
    const rec = await run('readonly', (s) => s.get(KEY));
    if (!rec?.blob) return null;
    if (uid && rec.uid && rec.uid !== uid) return null;
    return new File([rec.blob], rec.name, { type: rec.type, lastModified: rec.savedAt });
  } catch {
    return null;
  }
}

export async function clearPhoto() {
  try {
    await run('readwrite', (s) => s.delete(KEY));
  } catch {
    // Ignore
  }
}
