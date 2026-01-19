/**
 * IndexedDB wrapper for binary storage
 */
const VaultDB = {
    dbName: 'VaultDB',
    dbVersion: 2,
    storeName: 'files',
    folderStore: 'folders',
    db: null,

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains(this.folderStore)) {
                    db.createObjectStore(this.folderStore, { keyPath: 'id', autoIncrement: true });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => reject(event.target.error);
        });
    },

    async addFile(fileData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.add(fileData);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getAllFiles() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getFile(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async deleteFile(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // Folder Methods
    async addFolder(folderData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.folderStore], 'readwrite');
            const store = transaction.objectStore(this.folderStore);
            const request = store.add(folderData);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getAllFolders() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.folderStore], 'readonly');
            const store = transaction.objectStore(this.folderStore);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async deleteFolder(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.folderStore], 'readwrite');
            const store = transaction.objectStore(this.folderStore);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};
