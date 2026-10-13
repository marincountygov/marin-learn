const DB_NAME = 'marin-learn-editor';
const DB_VERSION = 1;
const STORE = 'workspaces';
const CURRENT_KEY = 'current';

export async function saveWorkspace(pkg) {
  const db = await openDatabase();
  return transactionPromise(db, 'readwrite', (store) => store.put({ key: CURRENT_KEY, savedAt: new Date().toISOString(), pkg }));
}

export async function loadWorkspace() {
  const db = await openDatabase();
  const record = await transactionPromise(db, 'readonly', (store) => store.get(CURRENT_KEY));
  return record || null;
}

export async function clearWorkspace() {
  const db = await openDatabase();
  return transactionPromise(db, 'readwrite', (store) => store.delete(CURRENT_KEY));
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open browser storage.'));
  });
}

function transactionPromise(db, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const request = operation(store);
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error || request?.error || new Error('Browser storage operation failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Browser storage operation was aborted.'));
  });
}
