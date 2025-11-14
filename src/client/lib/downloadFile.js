const fs = require('fs');
const path = require('path');
const axios = require('axios');
const zlib = require('zlib');
const { ensureDirectory } = require('../../utils/fileUtils');
const { verifyHMAC, createDecipher } = require('../../utils/crypto');
const { log } = require('../../utils/logger');
const { DECRYPTED_DIR } = require('../../config/paths');
const { UPLOAD } = require('../../config/constants');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadFile(serverBase, fileId, options = {}) {
  const logger = options.log || log;
  const outputDir = options.outputDir || DECRYPTED_DIR;
  const maxRetries = options.maxRetries || UPLOAD.MAX_RETRIES;
  const retryBaseMs = options.retryBaseMs || UPLOAD.RETRY_BASE_MS;
  const timeout = options.timeout || UPLOAD.TIMEOUT;

  ensureDirectory(outputDir);

  logger('Fetching metadata', { serverBase, fileId });
  const metaResp = await axios.get(`${serverBase}/meta/${fileId}`);
  const meta = metaResp.data;
  const { originalName, totalChunks, mediaKeyHex, ivHex, hmacHex } = meta;

  const mediaKey = Buffer.from(mediaKeyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');

  async function downloadChunkWithRetry(index) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const response = await axios.get(`${serverBase}/download-chunk/${fileId}/${index}`, {
          responseType: 'arraybuffer',
          timeout,
        });

        const buffer = Buffer.from(response.data);
        logger('Downloaded chunk', { fileId, chunkIndex: index, bytes: buffer.length, attempt });
        return buffer;
      } catch (err) {
        attempt++;
        const waitMs = retryBaseMs * Math.pow(2, attempt);
        logger('Chunk download failed, retrying', {
          fileId,
          chunkIndex: index,
          attempt,
          error: err.message,
          waitMs,
        });
        await sleep(waitMs);
      }
    }

    throw new Error(`Failed to download chunk ${index} after ${maxRetries} attempts`);
  }

  const chunks = [];
  let totalBytes = 0;
  for (let i = 0; i < totalChunks; i++) {
    const buffer = await downloadChunkWithRetry(i);
    chunks.push(buffer);
    totalBytes += buffer.length;
  }

  const ciphertext = Buffer.concat(chunks, totalBytes);

  const ciphertextPath = path.join(outputDir, `${originalName}.bin`);
  fs.writeFileSync(ciphertextPath, ciphertext);
  logger('Saved ciphertext', { fileId, path: ciphertextPath });

  if (!verifyHMAC(mediaKey, ciphertext, hmacHex)) {
    throw new Error('HMAC verification failed');
  }
  logger('HMAC verified', { fileId });

  const decipher = createDecipher(mediaKey, iv);
  const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const original = zlib.gunzipSync(compressed);

  const outputPath = path.join(outputDir, originalName);
  fs.writeFileSync(outputPath, original);
  logger('File recovered', { fileId, path: outputPath, size: original.length });

  return {
    fileId,
    originalName,
    outputPath,
    ciphertextPath,
    size: original.length,
  };
}

module.exports = {
  downloadFile,
};

