/**
 * Main Application Logic
 */

const App = {
    state: {
        isSetup: false,
        isAuthenticated: false,
        currentPin: '',
        files: [],
        folders: [],
        currentFolderId: null,
        path: [], // To keep track of folder names for breadcrumbs
        currentFileIndex: -1,
        selectedFiles: new Set(),
        selectedFolders: new Set(),
        activeObjectURLs: new Set()
    },

    elements: {
        authScreen: document.getElementById('auth-screen'),
        vaultScreen: document.getElementById('vault-screen'),
        authTitle: document.getElementById('auth-title'),
        authDesc: document.getElementById('auth-desc'),
        authError: document.getElementById('auth-error'),
        pinDots: document.querySelectorAll('.pin-dot'),
        fileInput: document.getElementById('file-upload'),
        fileList: document.getElementById('file-list'),
        emptyState: document.getElementById('empty-state'),
        previewModal: document.getElementById('preview-modal'),
        mediaViewport: document.getElementById('media-viewport'),
        previewFilename: document.getElementById('preview-filename'),
        storageInfo: document.getElementById('storage-info'),
        newFolderBtn: document.getElementById('new-folder-btn'),
        breadcrumbs: document.getElementById('breadcrumbs'),
        prevBtn: document.getElementById('prev-btn'),
        nextBtn: document.getElementById('next-btn'),
        bulkActions: document.getElementById('bulk-actions'),
        selectAllBtn: document.getElementById('select-all-btn'),
        exportSelectedBtn: document.getElementById('export-selected-btn'),
        deleteSelectedBtn: document.getElementById('delete-selected-btn'),
        clearSelectionBtn: document.getElementById('clear-selection-btn')
    },

    async init() {
        // PIN is fixed to "2006"
        this.state.isSetup = true;

        this.updateAuthUI();
        this.bindEvents();
        await VaultDB.init();

        // Request persistence
        this.checkPersistence();

        this.showScreen('auth-screen');
    },

    async checkPersistence() {
        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persisted();
            console.log(`Persisted storage: ${isPersisted}`);
            if (!isPersisted) {
                // We'll show a prompt or try to request it on user interaction
                // For now, let's just try to request it
                const result = await navigator.storage.persist();
                console.log(`Persistence request result: ${result}`);
            }
        }
    },

    updateAuthUI() {
        this.elements.authTitle.textContent = 'Unlock Vault';
        this.elements.authDesc.textContent = 'Enter the master PIN to access files.';
    },

    bindEvents() {
        // Numpad Events
        document.querySelectorAll('.num-btn[data-value]').forEach(btn => {
            btn.addEventListener('click', () => this.handlePinInput(btn.dataset.value));
        });

        document.getElementById('clear-btn').addEventListener('click', () => this.clearPin());
        document.getElementById('submit-btn').addEventListener('click', () => this.submitPin());

        // File/Folder Events
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        this.elements.newFolderBtn.addEventListener('click', () => this.createFolder());

        // Bulk Actions
        this.elements.selectAllBtn.addEventListener('click', () => this.selectAll());
        this.elements.exportSelectedBtn.addEventListener('click', () => this.exportSelectedAsZip());
        this.elements.deleteSelectedBtn.addEventListener('click', () => this.deleteSelected());
        this.elements.clearSelectionBtn.addEventListener('click', () => this.clearSelection());

        // Logout
        document.getElementById('logout-btn').addEventListener('click', () => this.lock());

        // Modal Events
        document.getElementById('close-preview').addEventListener('click', () => this.closePreview());
        document.getElementById('export-btn').addEventListener('click', () => this.exportCurrentFile());
        document.getElementById('delete-btn').addEventListener('click', () => this.deleteCurrentFile());
        this.elements.prevBtn.addEventListener('click', () => this.showPrev());
        this.elements.nextBtn.addEventListener('click', () => this.showNext());

        // Keyboard navigation
        window.addEventListener('keydown', (e) => {
            if (this.currentPreviewFile) {
                if (e.key === 'ArrowRight') this.showNext();
                if (e.key === 'ArrowLeft') this.showPrev();
                if (e.key === 'Escape') this.closePreview();
            }
        });
    },

    async exportSelectedAsZip() {
        const totalSelected = this.state.selectedFiles.size + this.state.selectedFolders.size;
        if (totalSelected === 0) return;

        this.elements.exportSelectedBtn.textContent = 'Preparing...';
        this.elements.exportSelectedBtn.disabled = true;

        // Helper to sanitize filename for Windows
        const sanitizeName = (name) => {
            let clean = name.replace(/\.lock$/i, '');
            const parts = clean.split('.');
            if (parts.length > 2) {
                const ext = parts.pop();
                clean = parts.join('_') + '.' + ext;
            }
            return clean.replace(/[<>:"/\\|?*#%]/g, '_');
        };

        try {
            const zip = new JSZip();
            const [allFiles, allFolders] = await Promise.all([
                VaultDB.getAllFiles(),
                VaultDB.getAllFolders()
            ]);

            const filesToZip = [];

            // 1. Selected Files
            for (const fileId of this.state.selectedFiles) {
                const file = allFiles.find(f => f.id === fileId);
                if (file) {
                    filesToZip.push({
                        blob: file.blob,
                        name: sanitizeName(file.originalName)
                    });
                }
            }

            // 2. Selected Folders (Recursive)
            const addFolderToZip = (folderId, parentPath) => {
                const folder = allFolders.find(f => f.id === folderId);
                const currentFolderName = folder ? folder.name.replace(/[<>:"/\\|?*#%]/g, '_') : 'Unknown';
                const currentPath = parentPath + currentFolderName + '/';

                const folderFiles = allFiles.filter(f => f.folderId === folderId);
                folderFiles.forEach(f => {
                    filesToZip.push({
                        blob: f.blob,
                        name: currentPath + sanitizeName(f.originalName)
                    });
                });

                const subFolders = allFolders.filter(f => f.parentId === folderId);
                subFolders.forEach(sub => addFolderToZip(sub.id, currentPath));
            };

            for (const folderId of this.state.selectedFolders) {
                addFolderToZip(folderId, "");
            }

            if (filesToZip.length === 0) {
                alert('No files found in selection.');
                return;
            }

            // Deduplicate and Handle Name Clashes by appending counters
            const usedPaths = new Set();
            for (const item of filesToZip) {
                let finalPath = item.name;

                if (usedPaths.has(finalPath)) {
                    // Collision! Append a number before the extension
                    const parts = finalPath.split('.');
                    if (parts.length > 1) {
                        const ext = parts.pop();
                        const base = parts.join('.');
                        let counter = 1;
                        while (usedPaths.has(`${base} (${counter}).${ext}`)) {
                            counter++;
                        }
                        finalPath = `${base} (${counter}).${ext}`;
                    } else {
                        let counter = 1;
                        while (usedPaths.has(`${finalPath} (${counter})`)) {
                            counter++;
                        }
                        finalPath = `${finalPath} (${counter})`;
                    }
                }

                zip.file(finalPath, item.blob, { date: new Date() });
                usedPaths.add(finalPath);
            }

            const content = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 4 }
            });

            await this.downloadBlob(content, `Vault_Export_${new Date().toISOString().split('T')[0]}.zip`);

            this.clearSelection();
        } catch (err) {
            if (err.name === 'AbortError') return; // User cancelled the picker
            console.error('Export failed:', err);
            alert('Export failed.');
        } finally {
            this.elements.exportSelectedBtn.textContent = 'Download Selected (ZIP)';
            this.elements.exportSelectedBtn.disabled = false;
        }
    },

    async deleteSelected() {
        const totalSelected = this.state.selectedFiles.size + this.state.selectedFolders.size;
        if (totalSelected === 0) return;

        if (confirm(`Are you sure you want to delete ${totalSelected} selected items and their contents?`)) {
            const allFiles = await VaultDB.getAllFiles();
            const allFolders = await VaultDB.getAllFolders();

            const recursiveDelete = async (folderId) => {
                // Delete files in this folder
                const folderFiles = allFiles.filter(f => f.folderId === folderId);
                for (const f of folderFiles) {
                    await VaultDB.deleteFile(f.id);
                }

                // Delete subfolders recursively
                const subFolders = allFolders.filter(f => f.parentId === folderId);
                for (const sub of subFolders) {
                    await recursiveDelete(sub.id);
                    await VaultDB.deleteFolder(sub.id);
                }
            };

            for (const fileId of this.state.selectedFiles) {
                await VaultDB.deleteFile(fileId);
            }

            for (const folderId of this.state.selectedFolders) {
                await recursiveDelete(folderId);
                await VaultDB.deleteFolder(folderId);
            }

            this.clearSelection();
            await this.loadFiles();
        }
    },

    toggleSelection(type, id) {
        if (type === 'file') {
            if (this.state.selectedFiles.has(id)) this.state.selectedFiles.delete(id);
            else this.state.selectedFiles.add(id);
        } else {
            if (this.state.selectedFolders.has(id)) this.state.selectedFolders.delete(id);
            else this.state.selectedFolders.add(id);
        }
        this.updateBulkUI();
        this.renderFiles();
    },

    selectAll() {
        const allAlreadySelected = this.state.files.every(f => this.state.selectedFiles.has(f.id)) &&
            this.state.folders.every(fod => this.state.selectedFolders.has(fod.id));

        if (allAlreadySelected) {
            // Deselect all in current view
            this.state.files.forEach(f => this.state.selectedFiles.delete(f.id));
            this.state.folders.forEach(fod => this.state.selectedFolders.delete(fod.id));
        } else {
            // Select all in current view
            this.state.files.forEach(f => this.state.selectedFiles.add(f.id));
            this.state.folders.forEach(fod => this.state.selectedFolders.add(fod.id));
        }

        this.updateBulkUI();
        this.renderFiles();
    },

    clearSelection() {
        this.state.selectedFiles.clear();
        this.state.selectedFolders.clear();
        this.updateBulkUI();
        this.renderFiles();
    },

    updateBulkUI() {
        const total = this.state.selectedFiles.size + this.state.selectedFolders.size;

        // Show bulk actions always if items exist, or if selection > 0
        if (total > 0 || (this.state.files.length > 0 || this.state.folders.length > 0)) {
            this.elements.bulkActions.classList.add('active');
        } else {
            this.elements.bulkActions.classList.remove('active');
        }

        // Toggle Select All / Deselect All text
        const allInViewSelected = (this.state.files.length > 0 || this.state.folders.length > 0) &&
            this.state.files.every(f => this.state.selectedFiles.has(f.id)) &&
            this.state.folders.every(fod => this.state.selectedFolders.has(fod.id));

        this.elements.selectAllBtn.textContent = allInViewSelected ? 'Deselect All' : 'Select All';
    },

    async createFolder() {
        const name = prompt('Enter folder name:');
        if (!name) return;

        const folderData = {
            name: name,
            parentId: this.state.currentFolderId,
            timestamp: Date.now()
        };

        await VaultDB.addFolder(folderData);
        await this.loadFiles();
    },

    navigateToFolder(id, name) {
        if (id === 'root') {
            this.state.currentFolderId = null;
            this.state.path = [];
        } else {
            this.state.currentFolderId = id;
            if (name) {
                // If name is provided, we are going deeper
                this.state.path.push({ id, name });
            } else {
                // If no name, we might be clicking a breadcrumb to go back
                const idx = this.state.path.findIndex(p => p.id === id);
                this.state.path = this.state.path.slice(0, idx + 1);
            }
        }
        this.clearSelection(); // Clear selection when navigating
        this.updateBreadcrumbs();
        this.loadFiles();
    },

    updateBreadcrumbs() {
        this.elements.breadcrumbs.innerHTML = '<span class="breadcrumb-item" data-id="root">Root</span>';
        this.state.path.forEach(p => {
            const span = document.createElement('span');
            span.className = 'breadcrumb-item';
            span.textContent = p.name;
            span.dataset.id = p.id;
            this.elements.breadcrumbs.appendChild(span);
        });

        // Add click listeners to breadcrumbs
        this.elements.breadcrumbs.querySelectorAll('.breadcrumb-item').forEach(item => {
            item.onclick = () => this.navigateToFolder(item.dataset.id === 'root' ? 'root' : parseInt(item.dataset.id));
        });
    },

    handlePinInput(val) {
        if (this.state.currentPin.length < 4) {
            this.state.currentPin += val;
            this.updatePinDots();
        }
    },

    clearPin() {
        this.state.currentPin = '';
        this.updatePinDots();
        this.elements.authError.classList.add('hidden');
    },

    updatePinDots() {
        this.elements.pinDots.forEach((dot, idx) => {
            if (idx < this.state.currentPin.length) {
                dot.classList.add('filled');
            } else {
                dot.classList.remove('filled');
            }
        });
    },

    async submitPin() {
        if (this.state.currentPin.length !== 4) return;

        const hash = await CryptoUtils.hashPIN(this.state.currentPin);
        const fixedHash = '0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c'; // hash of "1111"
        //command to change pin : python -c "import hashlib; print(hashlib.sha256('1111'.encode()).hexdigest())"
        if (hash === fixedHash) {
            this.state.isAuthenticated = true;
            this.enterVault();
        } else {
            this.elements.authError.classList.remove('hidden');
            this.clearPin();
        }
    },

    async enterVault() {
        this.showScreen('vault-screen');
        await this.loadFiles();
    },

    lock() {
        this.state.isAuthenticated = false;
        this.state.currentPin = '';
        this.updatePinDots();
        this.showScreen('auth-screen');
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.getElementById(screenId).classList.remove('hidden');
    },

    async handleFileUpload(e) {
        const files = Array.from(e.target.files);
        for (const file of files) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const blob = new Blob([event.target.result], { type: file.type });
                const fileData = {
                    storedName: `${file.name}.lock`,
                    originalName: file.name,
                    mimeType: file.type,
                    blob: blob,
                    folderId: this.state.currentFolderId,
                    timestamp: Date.now()
                };
                await VaultDB.addFile(fileData);
                await this.loadFiles();
            };
            reader.readAsArrayBuffer(file);
        }
        this.elements.fileInput.value = ''; // Reset
    },

    async loadFiles() {
        const [files, folders] = await Promise.all([
            VaultDB.getAllFiles(),
            VaultDB.getAllFolders()
        ]);

        // Filter by current folder
        this.state.files = files.filter(f => f.folderId === this.state.currentFolderId);
        this.state.folders = folders.filter(f => f.parentId === this.state.currentFolderId);

        this.renderFiles();
        this.updateBulkUI();
        this.updateStorageInfo();
    },

    async updateStorageInfo() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            const used = (estimate.usage / (1024 * 1024)).toFixed(1);
            const total = (estimate.quota / (1024 * 1024 * 1024)).toFixed(1);
            const isPersisted = await navigator.storage.persisted();
            const status = isPersisted ? '✓ Persistent' : '⚠ Temporary';
            this.elements.storageInfo.textContent = `Used: ${used}MB / Available: ~${total}GB (${status})`;
        }
    },

    revokeObjectURLs() {
        this.state.activeObjectURLs.forEach(url => URL.revokeObjectURL(url));
        this.state.activeObjectURLs.clear();
    },

    renderFiles() {
        this.revokeObjectURLs();
        this.elements.fileList.innerHTML = '';
        if (this.state.files.length === 0 && this.state.folders.length === 0) {
            this.elements.emptyState.classList.remove('hidden');
            return;
        }

        this.elements.emptyState.classList.add('hidden');

        // Render Folders
        this.state.folders.forEach(folder => {
            const isSelected = this.state.selectedFolders.has(folder.id);
            const card = document.createElement('div');
            card.className = `file-card folder ${isSelected ? 'selected' : ''}`;
            card.innerHTML = `
                <div class="file-thumb"></div>
                <div class="file-info">
                    <span class="file-name">${folder.name}</span>
                </div>
                <div class="select-box ${isSelected ? 'selected' : ''}" onclick="event.stopPropagation(); App.toggleSelection('folder', ${folder.id})"></div>
            `;
            card.onclick = () => this.navigateToFolder(folder.id, folder.name);
            this.elements.fileList.appendChild(card);
        });

        // Render Files
        this.state.files.forEach((file, index) => {
            const isSelected = this.state.selectedFiles.has(file.id);
            const url = URL.createObjectURL(file.blob);
            this.state.activeObjectURLs.add(url);

            const card = document.createElement('div');
            card.className = `file-card ${isSelected ? 'selected' : ''}`;
            card.innerHTML = `
                <div class="file-type-icon">${file.mimeType.split('/')[0]}</div>
                <img class="file-thumb" src="${url}" alt="${file.storedName}">
                <div class="file-info">
                    <span class="file-name">${file.storedName.replace(/\.lock$/i, '')}</span>
                </div>
                <div class="select-box ${isSelected ? 'selected' : ''}" onclick="event.stopPropagation(); App.toggleSelection('file', ${file.id})"></div>
            `;
            card.onclick = () => this.openPreview(index);
            this.elements.fileList.appendChild(card);
        });
    },

    currentPreviewFile: null,

    openPreview(index) {
        if (index < 0 || index >= this.state.files.length) return;

        this.state.currentFileIndex = index;
        const file = this.state.files[index];
        this.currentPreviewFile = file;

        this.elements.previewFilename.textContent = file.storedName.replace(/\.lock$/i, '');
        this.elements.mediaViewport.innerHTML = '';

        const url = URL.createObjectURL(file.blob);
        let media;
        if (file.mimeType.startsWith('image/')) {
            media = document.createElement('img');
            media.src = url;
        } else if (file.mimeType.startsWith('video/')) {
            media = document.createElement('video');
            media.src = url;
            media.controls = true;
            media.autoplay = true;
        }

        this.elements.mediaViewport.appendChild(media);
        this.elements.previewModal.classList.remove('hidden');
        this.updateNavButtons();
    },

    showNext() {
        if (this.state.currentFileIndex < this.state.files.length - 1) {
            this.openPreview(this.state.currentFileIndex + 1);
        }
    },

    showPrev() {
        if (this.state.currentFileIndex > 0) {
            this.openPreview(this.state.currentFileIndex - 1);
        }
    },

    updateNavButtons() {
        this.elements.prevBtn.style.visibility = this.state.currentFileIndex > 0 ? 'visible' : 'hidden';
        this.elements.nextBtn.style.visibility = this.state.currentFileIndex < this.state.files.length - 1 ? 'visible' : 'hidden';
    },

    closePreview() {
        this.elements.previewModal.classList.add('hidden');
        this.elements.mediaViewport.innerHTML = '';
        this.currentPreviewFile = null;
    },

    async deleteCurrentFile() {
        if (!this.currentPreviewFile) return;
        if (confirm('Are you sure you want to delete this file from the vault?')) {
            await VaultDB.deleteFile(this.currentPreviewFile.id);
            this.closePreview();
            await this.loadFiles();
        }
    },

    async exportCurrentFile() {
        if (!this.currentPreviewFile) return;

        // Sanitize for Windows
        let cleanName = this.currentPreviewFile.originalName.replace(/\.lock$/i, '');
        const parts = cleanName.split('.');
        if (parts.length > 2) {
            const ext = parts.pop();
            cleanName = parts.join('_') + '.' + ext;
        }
        cleanName = cleanName.replace(/[<>:"/\\|?*#%]/g, '_');

        await this.downloadBlob(this.currentPreviewFile.blob, cleanName);
    },

    /**
     * Helper to handle downloads with "Save As" or "Share" options
     */
    async downloadBlob(blob, filename) {
        // 1. Try File System Access API (Desktop Save As dialog)
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                return;
            } catch (err) {
                if (err.name === 'AbortError') throw err;
                console.warn('File System API failed, falling back:', err);
            }
        }

        // 2. Try Web Share API (Mobile "Save to Files" or Share sheet)
        if (navigator.canShare && navigator.share) {
            try {
                const file = new File([blob], filename, { type: blob.type });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: filename,
                        text: 'Export from Vault'
                    });
                    return;
                }
            } catch (err) {
                console.warn('Share API failed, falling back:', err);
            }
        }

        // 3. Fallback to standard <a> download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }
};

window.onload = () => App.init();
