/**
 * Persists draft file attachments in IndexedDB.
 * Files can't be stored in localStorage (binary data), so we use IDB.
 *
 * DB: messenger_draft_files
 * Store: files
 * Key: `{projectId}:{channel}` → File[]
 */

const DB_NAME = 'messenger_draft_files'
const STORE_NAME = 'files'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadDraftFiles(draftKey: string): Promise<File[]> {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(draftKey)
      req.onsuccess = () => resolve((req.result as File[]) ?? [])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

export async function saveDraftFiles(draftKey: string, files: File[]): Promise<void> {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      if (files.length > 0) {
        tx.objectStore(STORE_NAME).put(files, draftKey)
      } else {
        tx.objectStore(STORE_NAME).delete(draftKey)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    /* ignore */
  }
}

export async function clearDraftFiles(draftKey: string): Promise<void> {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(draftKey)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    /* ignore */
  }
}
