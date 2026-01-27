const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '.')));

// Security Headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
});

// Mock Database for PIN (In a real app, this would be a secure DB)
// For this challenge, we'll use a hardcoded hash or separate storage.
// However, to strictly follow "keep state in client" typically implies we verify against something.
// But the prompt asks to "move the login authentication check to server-side".
// So we will store the 'correct' PIN hash here.
// Let's assume the default PIN is '1234' for demonstration if not set, 
// or simpler: we act as the verifier.
// Since the original app let users SET the PIN, the server needs to support that too.
// For simplicity in this vulnerability fix context, we'll store the PIN in memory.
let serverPinHash = null;

// Helper to hash PIN
const hashPIN = (pin) => {
    return crypto.createHash('sha256').update(pin).digest('hex');
};

// API: Setup PIN
app.post('/api/setup', (req, res) => {
    const { pin } = req.body;
    if (!pin || pin.length !== 4) {
        return res.status(400).json({ success: false, message: 'Invalid PIN format' });
    }
    if (serverPinHash) {
        return res.status(403).json({ success: false, message: 'PIN already set' });
    }
    serverPinHash = hashPIN(pin);
    console.log('PIN set on server');
    res.json({ success: true });
});

// API: Login
app.post('/api/login', (req, res) => {
    const { pin } = req.body;
    if (!serverPinHash) {
        return res.status(400).json({ success: false, message: 'Setup required', requiresSetup: true });
    }

    const incomingHash = hashPIN(pin);
    if (crypto.timingSafeEqual(Buffer.from(incomingHash), Buffer.from(serverPinHash))) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Invalid PIN' });
    }
});

// API: Check status
app.get('/api/status', (req, res) => {
    res.json({ isSetup: !!serverPinHash });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
