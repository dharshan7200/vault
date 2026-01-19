# Local Web-Based Vault

A secure, client-side only web application to store images and videos locally on your device.

## How to Run

### Option 1: Using a Local Server (Recommended)
If you have Node.js installed, you can run:
```bash
npx http-server ./ -p 8080
```
Then visit: [http://localhost:8080](http://localhost:8080)

### Option 2: Opening the File Directly
You can also simply open the `index.html` file in a modern web browser (Chrome, Edge, Brave).
*Note: Some features like PWA/Service Workers may require a server (Option 1).*

## Usage
1.  **Enter PIN**: The master PIN is `2006`.
2.  **Upload**: Click the "Upload Files" button to add media.
3.  **View**: Click on a file thumbnail to open the preview.
4.  **Export/Restore**: Click the "Export" button in the preview to download the file with its original name.
5.  **Delete**: Click "Delete" to permanently remove a file from the vault.

## Important Note
> [!CAUTION]
> All files are stored **locally in your browser's IndexedDB**. 
> Clearing your browser cache or site data for this site will **PERMANENTLY DELETE** all your stored files.
