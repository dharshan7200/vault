/**
 * Crypto utility for hashing the PIN using SHA-256
 */
const CryptoUtils = {
    async hashPIN(pin) {
        const encoder = new TextEncoder();
        const data = encoder.encode(pin);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    },

    async _deriveKey(pinHashHex) {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            encoder.encode(pinHashHex),
            { name: "PBKDF2" },
            false,
            ["deriveBits", "deriveKey"]
        );
        const salt = encoder.encode("vault-secure-salt-v1");
        return crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    },

    async encryptData(arrayBuffer, pinHash) {
        const key = await this._deriveKey(pinHash);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            arrayBuffer
        );
        return { encryptedData: encrypted, iv: Array.from(iv) };
    },

    async decryptData(encryptedBuffer, ivArray, pinHash) {
        const key = await this._deriveKey(pinHash);
        const iv = new Uint8Array(ivArray);
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            encryptedBuffer
        );
        return decrypted;
    }
};
