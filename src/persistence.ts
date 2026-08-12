import { isBoardDocument } from './board'
import type { BoardDocument } from './types'

const DATABASE_NAME = 'ethical-tech-colab-board'
const STORE_NAME = 'documents'
const ACTIVE_DOCUMENT_KEY = 'active-board'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open local storage.'))
  })
}

export async function loadBoard(): Promise<BoardDocument | undefined> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(ACTIVE_DOCUMENT_KEY)
    request.onsuccess = () => {
      resolve(isBoardDocument(request.result) ? request.result : undefined)
    }
    request.onerror = () =>
      reject(request.error ?? new Error('Could not read the saved board.'))
    transaction.oncomplete = () => database.close()
  })
}

export async function saveBoard(document: BoardDocument): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction
      .objectStore(STORE_NAME)
      .put(document, ACTIVE_DOCUMENT_KEY)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('Could not save the board.'))
    }
  })
}
