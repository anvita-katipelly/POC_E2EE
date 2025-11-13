// sender.js
// Usage: node sender.js <path/to/input-file> <server_base>
// Example: node sender.js sample.jpg http://192.168.1.7:3000
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const axios = require('axios');
const FormData = require('form-data');

const INPUT = process.argv[2];
const SERVER_BASE = process.argv[3] || 'http://localhost:3000';

if (!INPUT || !fs.existsSync(INPUT)) {
  console.error('Usage: node sender.js <input-file> <server_base>');
  process.exit(1);
}

// 1) Read file
const orig = fs.readFileSync(INPUT);
console.log('Original filename:', INPUT);
console.log('Original size (bytes):', orig.length);

// 2) Compress (gzip)
const compressed = zlib.gzipSync(orig);
console.log('Compressed size (bytes):', compressed.length);

// 3) Generate mediaKey (32 bytes)
const mediaKey = crypto.randomBytes(32);
console.log('MediaKey (hex) - KEEP SECRET:', mediaKey.toString('hex'));

// 4) Encrypt using AES-256-CBC
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-cbc', mediaKey, iv);
const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
console.log('Ciphertext size (bytes):', ciphertext.length);

// 5) Compute HMAC-SHA256 over (iv || ciphertext) using mediaKey (demo)
const hmac = crypto.createHmac('sha256', mediaKey).update(Buffer.concat([iv, ciphertext])).digest();
console.log('HMAC (hex):', hmac.toString('hex'));

// 6) Build payload: [iv][ciphertext][hmac]
const payload = Buffer.concat([iv, ciphertext, hmac]);
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const outname = path.join(uploadsDir, `${path.basename(INPUT)}.bin`);
fs.writeFileSync(outname, payload);
console.log('Wrote local payload file:', outname);

// 7) Upload payload to media server
(async () => {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(outname), outname);

    const headers = form.getHeaders();
    const resp = await axios.post(`${SERVER_BASE}/upload`, form, { headers });
    if (!resp.data || !resp.data.filename) throw new Error('upload failed');

    console.log('Upload response:', resp.data);
    const filename = resp.data.filename;

    // 8) STORE the mediaKey (plaintext) on server (INSECURE)
    await axios.post(`${SERVER_BASE}/store-key`, { filename, mediaKeyHex: mediaKey.toString('hex') });
    console.log('Stored mediaKey on server for filename:', filename);

    console.log('\nPOC INFO:');
    console.log('Download URL:', `${SERVER_BASE}/uploads/${filename}`);
    console.log('Filename (use with receiver):', filename);
    console.log('MediaKey (hex) was stored on server (insecure).');
  } catch (err) {
    console.error('Error uploading/storing key:', err.message);
  }
})();
