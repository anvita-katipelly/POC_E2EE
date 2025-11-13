// receiver.js
// Usage: node src/client/receiver.js <server_base> <fileId>
// Example: node src/client/receiver.js http://localhost:3000 test.jpg

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { DECRYPTED_DIR } = require('../config/paths');
const { ensureDirectory } = require('../utils/fileUtils');
const { verifyHMAC } = require('../utils/crypto');
const { createDecipher } = require('../utils/crypto');
const zlib = require('zlib');
const { log } = require('../utils/logger');

const SERVER = process.argv[2] || 'http://localhost:3000';
const FILE_ID = process.argv[3];

if (!FILE_ID) {
  console.error('Usage: node src/client/receiver.js <server_base> <fileId>');
  process.exit(1);
}

// Ensure output directory exists
ensureDirectory(DECRYPTED_DIR);

(async () => {
  try {
    // 1) Fetch metadata
    const metaResp = await axios.get(`${SERVER}/meta/${FILE_ID}`);
    const meta = metaResp.data;
    const { originalName, totalChunks, mediaKeyHex, ivHex, hmacHex } = meta;
    log('Metadata fetched', { originalName, totalChunks });

    const mediaKey = Buffer.from(mediaKeyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');

    // 2) Download and concatenate ciphertext chunks
    const chunks = [];
    let totalBytes = 0;
    for (let i = 0; i < totalChunks; i++) {
      const resp = await axios.get(`${SERVER}/download-chunk/${FILE_ID}/${i}`, {
        responseType: 'arraybuffer',
      });
      const buf = Buffer.from(resp.data);
      chunks.push(buf);
      totalBytes += buf.length;
      log('Downloaded chunk', { chunkIndex: i, bytes: buf.length });
    }
    const ciphertext = Buffer.concat(chunks, totalBytes);

    // Save raw ciphertext to disk
    const ciphertextPath = path.join(DECRYPTED_DIR, `${originalName}.bin`);
    fs.writeFileSync(ciphertextPath, ciphertext);
    log('Saved ciphertext', { path: ciphertextPath });

    // 3) Verify HMAC
    if (!verifyHMAC(mediaKey, ciphertext, hmacHex)) {
      throw new Error('HMAC mismatch! data integrity failed.');
    }
    log('HMAC verified OK');

    // 4) Decrypt ciphertext (AES-256-CBC)
    const decipher = createDecipher(mediaKey, iv);
    const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    log('Decrypted', { compressedBytes: compressed.length });

    // 5) Decompress (gunzip)
    const original = zlib.gunzipSync(compressed);
    const outPath = path.join(DECRYPTED_DIR, originalName);
    fs.writeFileSync(outPath, original);
    log('File recovered', { path: outPath, size: original.length });

    console.log(`\nDone — file recovered to: ${outPath}`);
  } catch (err) {
    console.error('Receiver error:', err.message);
    process.exit(1);
  }
})();

