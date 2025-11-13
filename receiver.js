// receiver.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const zlib = require('zlib');

const SERVER = process.argv[2] || 'http://localhost:3000';
const FILE_ID = process.argv[3];
if (!FILE_ID) {
  console.error('Usage: node receiver.js <server_base> <fileId>');
  process.exit(1);
}

const OUT_DIR = path.join(__dirname, 'decrypted');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  try {
    // 1) fetch metadata
    const metaResp = await axios.get(`${SERVER}/meta/${FILE_ID}`);
    const meta = metaResp.data;
    const { originalName, totalChunks, mediaKeyHex, ivHex, hmacHex } = meta;
    console.log('Metadata:', { originalName, totalChunks });

    const mediaKey = Buffer.from(mediaKeyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const expectedHmac = hmacHex;

    // 2) download and concatenate ciphertext chunks
    const chunks = [];
    let totalBytes = 0;
    for (let i = 0; i < totalChunks; i++) {
      const resp = await axios.get(`${SERVER}/download-chunk/${FILE_ID}/${i}`, { responseType: 'arraybuffer' });
      const buf = Buffer.from(resp.data);
      chunks.push(buf);
      totalBytes += buf.length;
      console.log(`Downloaded chunk ${i} (${buf.length} bytes)`);
    }
    const ciphertext = Buffer.concat(chunks, totalBytes);

    // save raw ciphertext to disk (iv + ciphertext + hmac is not stored by sender as single payload,
    // sender only uploaded ciphertext chunks. We saved ciphertext here.)
    const ciphertextPath = path.join(OUT_DIR, `${originalName}.bin`);
    fs.writeFileSync(ciphertextPath, ciphertext);
    console.log('Saved ciphertext to', ciphertextPath);

    // 3) verify HMAC (sender updated hmac with ciphertext bytes)
    const h = crypto.createHmac('sha256', mediaKey).update(ciphertext).digest('hex');
    if (h !== expectedHmac) {
      throw new Error('HMAC mismatch! data integrity failed.');
    }
    console.log('HMAC verified OK');

    // 4) decrypt ciphertext (AES-256-CBC)
    const decipher = crypto.createDecipheriv('aes-256-cbc', mediaKey, iv);
    const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    console.log('Decrypted compressed bytes:', compressed.length);

    // 5) decompress (gunzip)
    const original = zlib.gunzipSync(compressed);
    const outPath = path.join(OUT_DIR, originalName);
    fs.writeFileSync(outPath, original);
    console.log('Wrote recovered original file to', outPath);
  } catch (err) {
    console.error('Receiver error:', err.message);
    process.exit(1);
  }
})();
