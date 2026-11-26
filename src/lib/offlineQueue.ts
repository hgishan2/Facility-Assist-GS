import type { OfflineOpItem, OfflineQueueItem, WorkAttachment } from '../types';

const DB_NAME = 'siteledger_offline_db';
const DB_VERSION = 2;
const QUEUE_STORE = 'outbox_queue';
const OPS_QUEUE_STORE = 'ops_outbox';
const ATTACHMENT_CACHE_STORE = 'attachment_cache';

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'queueId' });
      }
      if (!db.objectStoreNames.contains(OPS_QUEUE_STORE)) {
        db.createObjectStore(OPS_QUEUE_STORE, { keyPath: 'queueId' });
      }
      if (!db.objectStoreNames.contains(ATTACHMENT_CACHE_STORE)) {
        db.createObjectStore(ATTACHMENT_CACHE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueOfflineLog(item: OfflineQueueItem): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([QUEUE_STORE, ATTACHMENT_CACHE_STORE], 'readwrite');
    tx.objectStore(QUEUE_STORE).put(item);
    for (const att of item.attachments) {
      tx.objectStore(ATTACHMENT_CACHE_STORE).put({
        id: att.id,
        logId: item.logPayload.id,
        buildingId: item.logPayload.buildingId,
        kind: att.kind,
        fileName: att.fileName,
        mimeType: att.mimeType,
        dataUrl: att.dataUrl,
        caption: att.caption,
        uploadedByUid: item.logPayload.submittedByUid,
        uploadedByEmail: item.logPayload.submittedByEmail,
        supervisorEmails: item.logPayload.supervisorEmails,
        buildingMemberEmails: item.logPayload.buildingMemberEmails,
      });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getOfflineQueue(): Promise<OfflineQueueItem[]> {
  try {
    const db = await openOfflineDb();
    const items = await new Promise<OfflineQueueItem[]>((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readonly');
      const req = tx.objectStore(QUEUE_STORE).getAll();
      req.onsuccess = () => resolve((req.result as OfflineQueueItem[]) || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return items.sort((a, b) => a.queuedAtIso.localeCompare(b.queuedAtIso));
  } catch {
    return [];
  }
}

export async function removeOfflineQueueItem(queueId: string): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(queueId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function updateOfflineQueueError(queueId: string, errorMessage: string): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    const getReq = store.get(queueId);
    getReq.onsuccess = () => {
      const existing = getReq.result as OfflineQueueItem | undefined;
      if (existing) {
        existing.attempts += 1;
        existing.lastError = errorMessage;
        store.put(existing);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function enqueueOfflineOp(item: OfflineOpItem): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OPS_QUEUE_STORE, 'readwrite');
    tx.objectStore(OPS_QUEUE_STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getOfflineOpsQueue(): Promise<OfflineOpItem[]> {
  try {
    const db = await openOfflineDb();
    const items = await new Promise<OfflineOpItem[]>((resolve, reject) => {
      const tx = db.transaction(OPS_QUEUE_STORE, 'readonly');
      const req = tx.objectStore(OPS_QUEUE_STORE).getAll();
      req.onsuccess = () => resolve((req.result as OfflineOpItem[]) || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return items.sort((a, b) => a.queuedAtIso.localeCompare(b.queuedAtIso));
  } catch {
    return [];
  }
}

export async function removeOfflineOpItem(queueId: string): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OPS_QUEUE_STORE, 'readwrite');
    tx.objectStore(OPS_QUEUE_STORE).delete(queueId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function updateOfflineOpError(queueId: string, errorMessage: string): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OPS_QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(OPS_QUEUE_STORE);
    const getReq = store.get(queueId);
    getReq.onsuccess = () => {
      const existing = getReq.result as OfflineOpItem | undefined;
      if (existing) {
        existing.attempts += 1;
        existing.lastError = errorMessage;
        store.put(existing);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function cacheAttachmentLocally(attachment: WorkAttachment): Promise<void> {
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ATTACHMENT_CACHE_STORE, 'readwrite');
      tx.objectStore(ATTACHMENT_CACHE_STORE).put(attachment);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore local cache write errors
  }
}

export async function getCachedAttachment(id: string): Promise<WorkAttachment | null> {
  try {
    const db = await openOfflineDb();
    const result = await new Promise<WorkAttachment | null>((resolve, reject) => {
      const tx = db.transaction(ATTACHMENT_CACHE_STORE, 'readonly');
      const req = tx.objectStore(ATTACHMENT_CACHE_STORE).get(id);
      req.onsuccess = () => resolve((req.result as WorkAttachment) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}
