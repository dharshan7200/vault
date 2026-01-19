/**
 * Main Application Logic
 */

const App = {
    state: {
        isSetup: false,
        isAuthenticated: false,
        currentPin: '',
        files: []
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
        previewFilename: document.getElementById('preview-filename')
    },

    async init() {
        // PIN is fixed to "2006"
        this.state.isSetup = true;

        this.updateAuthUI();
        this.bindEvents();
        await VaultDB.init();

        this.showScreen('auth-screen');
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

        // File Events
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

        // Logout
        document.getElementById('logout-btn').addEventListener('click', () => this.lock());

        // Modal Events
        document.getElementById('close-preview').addEventListener('click', () => this.closePreview());
        document.getElementById('export-btn').addEventListener('click', () => this.exportCurrentFile());
        document.getElementById('delete-btn').addEventListener('click', () => this.deleteCurrentFile());
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
        const fixedHash = '6f6a4e56098cfd9af29e3ae549503b370211a4e94421457fe4cfd39a38a1fa08'; // hash of "2006"

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
        const files = await VaultDB.getAllFiles();
        this.state.files = files;
        this.renderFiles();
    },

    renderFiles() {
        this.elements.fileList.innerHTML = '';
        if (this.state.files.length === 0) {
            this.elements.emptyState.classList.remove('hidden');
            return;
        }

        this.elements.emptyState.classList.add('hidden');
        this.state.files.forEach(file => {
            const card = document.createElement('div');
            card.className = 'file-card';
            card.innerHTML = `
                <div class="file-type-icon">${file.mimeType.split('/')[0]}</div>
                <img class="file-thumb" src="${URL.createObjectURL(file.blob)}" alt="${file.storedName}">
                <div class="file-info">
                    <span class="file-name">${file.storedName}</span>
                </div>
            `;
            card.onclick = () => this.openPreview(file);
            this.elements.fileList.appendChild(card);
        });
    },

    currentPreviewFile: null,

    openPreview(file) {
        this.currentPreviewFile = file;
        this.elements.previewFilename.textContent = file.storedName;
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

    exportCurrentFile() {
        if (!this.currentPreviewFile) return;
        const url = URL.createObjectURL(this.currentPreviewFile.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.currentPreviewFile.originalName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
};

window.onload = () => App.init();
