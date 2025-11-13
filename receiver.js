
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const axios = require('axios');

const SERVER_BASE = process.argv[2] || 'http://localhost:3000';
let FILENAME = process.argv[3];

if (!FILENAME) {
  console.error('Usage: node receiver.js <server_base> <filename>');
  process.exit(1);
}

// Normalize filenames:
// if arg contains ".bin" we treat that as the encrypted filename already.
// encryptedName -> what we'll save the .bin as in decrypted folder
// originalName  -> the recovered original filename (no prefixes/suffixes added)
const baseArg = path.basename(FILENAME);
let encryptedName, originalName;

if (baseArg.toLowerCase().endsWith('.bin')) {
  encryptedName = baseArg;                        // e.g. "sample.jpg.bin"
  originalName = encryptedName.replace(/\.bin$/i, ''); // "sample.jpg"
} else {
  originalName = baseArg;                         // e.g. "sample.jpg" or "sample"
  encryptedName = `${originalName}.bin`;          // e.g. "sample.jpg.bin"
}

// decrypted directory (stores both .bin and recovered file)
const OUT_DIR = path.join(__dirname, 'decrypted');

(async () => {
  try {
    // ensure output dir exists
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    console.log(`Fetching media key for filename "${originalName}" from server...`);
    // server endpoint for key (adjust if your server has different path)
    const keyResp = await axios.get(`${SERVER_BASE}/get-key`, { params: { filename: originalName }});
    if (!keyResp.data || !keyResp.data.mediaKeyHex) throw new Error('media key not found on server');
    const mediaKey = Buffer.from(keyResp.data.mediaKeyHex, 'hex');
    console.log('Got mediaKey (hex) from server.');

    // Download payload from server uploads (assumes server serves /uploads/<filename>)
    const downloadUrl = `${SERVER_BASE}/uploads/${encryptedName}`;
    console.log('Downloading payload from:', downloadUrl);
    const dl = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
    const payload = Buffer.from(dl.data);
    console.log('Downloaded payload bytes:', payload.length);

    // Save the raw .bin payload into decrypted/<encryptedName>
    const payloadPath = path.join(OUT_DIR, encryptedName);
    fs.writeFileSync(payloadPath, payload);
    console.log('Saved encrypted payload to:', payloadPath);

    // parse payload: iv (16) | ciphertext | hmac (32)
    if (payload.length < 48) throw new Error('payload too small (expect at least iv + hmac)');
    const iv = payload.slice(0, 16);
    const hmacReceived = payload.slice(payload.length - 32);
    const ciphertext = payload.slice(16, payload.length - 32);

    console.log('IV (hex):', iv.toString('hex'));
    console.log('HMAC received (hex):', hmacReceived.toString('hex'));
    console.log('Ciphertext bytes:', ciphertext.length);

    // Verify HMAC (using mediaKey) — order: HMAC over iv || ciphertext in your sender code,
    // but the previous version used HMAC over [iv + ciphertext] (or ciphertext alone). Adjust as needed.
    const mac = crypto.createHmac('sha256', mediaKey).update(Buffer.concat([iv, ciphertext])).digest();
    console.log('HMAC computed (hex):', mac.toString('hex'));

    if (!crypto.timingSafeEqual(mac, hmacReceived)) {
      console.error('HMAC mismatch! Aborting.');
      process.exit(2);
    }
    console.log('HMAC verified: payload integrity OK');

    // Decrypt (AES-256-CBC)
    const decipher = crypto.createDecipheriv('aes-256-cbc', mediaKey, iv);
    const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    console.log('Decrypted compressed bytes:', compressed.length);

    // Decompress (gunzip)
    const recovered = zlib.gunzipSync(compressed);
    console.log('Recovered original bytes:', recovered.length);

    // Write recovered file with exactly the original filename (no prefix/suffix)
    const recoveredPath = path.join(OUT_DIR, originalName);
    fs.writeFileSync(recoveredPath, recovered);
    console.log('Wrote recovered file to:', recoveredPath);

    console.log('\nDone — both encrypted .bin and recovered file are in the "decrypted" folder.');
  } catch (err) {
    console.error('Receiver error:', err.message);
    process.exit(1);
  }
})();
