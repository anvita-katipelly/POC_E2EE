// sender.js (robust with retries + status verification)
// Usage: node src/client/sender.js <server_base> <input_file>
// Example: node src/client/sender.js http://localhost:3000 /path/to/file.ext

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const axios = require('axios');
const stream = require('stream');
const { promisify } = require('util');
const { generateMediaKey, generateIV, createCipher, createHMAC } = require('../utils/crypto');
const { log } = require('../utils/logger');
const { UPLOAD } = require('../config/constants');

const pipeline = promisify(stream.pipeline);

// Parse arguments
const SERVER = process.argv[2] || 'http://localhost:3000';
const INPUT = process.argv[3];

if (!INPUT || !fs.existsSync(INPUT)) {
  console.error('Usage: node src/client/sender.js <server_base> <input_file>');
  process.exit(1);
}

const CHUNK_SIZE = UPLOAD.CHUNK_SIZE;
const MAX_RETRIES = UPLOAD.MAX_RETRIES;
const RETRY_BASE_MS = UPLOAD.RETRY_BASE_MS;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const fileName = path.basename(INPUT);
  const fileStat = fs.statSync(INPUT);
  const fileId = fileName; // Using filename as fileId for simplicity
  log('Starting upload', { fileId, fileName, size: fileStat.size });

  // Prepare crypto and compression
  const gzip = zlib.createGzip();
  const mediaKey = generateMediaKey();
  const iv = generateIV();
  const cipher = createCipher(mediaKey, iv);
  const hmac = createHMAC(mediaKey);

  // Chunk accumulator
  let idx = 0;
  let acc = Buffer.alloc(0);
  const uploadedIndices = [];

  // Chunk upload function with retry
  async function uploadChunkWithRetry(fileId, chunkIndex, buf) {
    let attempt = 0;
    while (attempt < MAX_RETRIES) {
      try {
        const FormData = require('form-data');
        const form = new FormData();
        form.append('fileId', fileId);
        form.append('chunkIndex', String(chunkIndex));
        form.append('chunk', buf, { filename: `${chunkIndex}.chunk` });

        const headers = form.getHeaders();
        await axios.post(`${SERVER}/upload-chunk`, form, {
          headers,
          maxBodyLength: Infinity,
          timeout: UPLOAD.TIMEOUT,
        });
        log('Uploaded chunk', { fileId, chunkIndex, bytes: buf.length, attempt });
        return true;
      } catch (err) {
        attempt++;
        const wait = RETRY_BASE_MS * Math.pow(2, attempt);
        log('Chunk upload failed, retrying', {
          fileId,
          chunkIndex,
          attempt,
          err: err.message,
          waitMs: wait,
        });
        await sleep(wait);
      }
    }
    log('Chunk upload failed permanently', { fileId, chunkIndex });
    return false;
  }

  // Chunker writable that uploads whenever CHUNK_SIZE reached
  const chunker = new stream.Writable({
    write: async (chunk, _enc, cb) => {
      try {
        // Update HMAC with ciphertext bytes
        hmac.update(chunk);

        acc = Buffer.concat([acc, chunk]);
        while (acc.length >= CHUNK_SIZE) {
          const toSend = acc.slice(0, CHUNK_SIZE);
          acc = acc.slice(CHUNK_SIZE);
          const currentIdx = idx++;
          const ok = await uploadChunkWithRetry(fileId, currentIdx, toSend);
          if (!ok) throw new Error(`Failed to upload chunk ${currentIdx}`);
          uploadedIndices.push(currentIdx);
        }
        cb();
      } catch (e) {
        cb(e);
      }
    },
    final: async (cb) => {
      try {
        if (acc.length > 0) {
          const currentIdx = idx++;
          const ok = await uploadChunkWithRetry(fileId, currentIdx, acc);
          if (!ok) throw new Error(`Failed to upload final chunk ${currentIdx}`);
          uploadedIndices.push(currentIdx);
          acc = Buffer.alloc(0);
        }
        cb();
      } catch (e) {
        cb(e);
      }
    },
  });

  try {
    // Pipeline: read -> gzip -> cipher -> chunker
    await pipeline(fs.createReadStream(INPUT), gzip, cipher, chunker);

    const totalChunks = idx;
    const hmacHex = hmac.digest('hex');
    log('All chunks uploaded (initial pass)', {
      fileId,
      totalChunks,
      uploadedCount: uploadedIndices.length,
      hmacHex,
    });

    // POST /complete metadata
    await axios.post(`${SERVER}/complete`, {
      fileId,
      originalName: fileName,
      totalChunks,
      mediaKeyHex: mediaKey.toString('hex'),
      ivHex: iv.toString('hex'),
      hmacHex,
    });
    log('Posted /complete metadata', { fileId });

    // Verify server status and reupload missing chunks if any
    const statusResp = await axios.get(`${SERVER}/status/${fileId}`);
    const received = statusResp.data.received || [];
    const missing = [];
    for (let i = 0; i < totalChunks; i++) {
      if (!received.includes(i)) missing.push(i);
    }

    if (missing.length === 0) {
      log('All chunks confirmed by server', { fileId, totalChunks });
    } else {
      log('Server missing chunks detected — reuploading missing chunks', {
        fileId,
        missingCount: missing.length,
        missing,
      });
      await reuploadMissingChunks(fileId, missing, totalChunks);
    }

    log('Upload finished', { fileId });
    console.log('>>> IMPORTANT: Keep this fileId to retrieve the file:', fileId);
  } catch (err) {
    console.error('Upload pipeline failed:', err.message);
    process.exit(1);
  }

  // Re-stream the pipeline and capture buffers for missing chunks and send them
  async function reuploadMissingChunks(fileId, missingIndices, totalChunks) {
    log('Re-streaming file to re-create ciphertext for missing chunks', { fileId });

    const neededSet = new Set(missingIndices);
    let currentIdx = 0;
    let acc2 = Buffer.alloc(0);

    // Create new streams
    const gzip2 = zlib.createGzip();
    const cipher2 = createCipher(mediaKey, iv);

    const chunker2 = new stream.Writable({
      write: async (chunk, _enc, cb) => {
        try {
          acc2 = Buffer.concat([acc2, chunk]);
          while (acc2.length >= CHUNK_SIZE) {
            const toSend = acc2.slice(0, CHUNK_SIZE);
            acc2 = acc2.slice(CHUNK_SIZE);
            if (neededSet.has(currentIdx)) {
              const ok = await uploadChunkWithRetry(fileId, currentIdx, toSend);
              if (!ok) throw new Error(`Failed to reupload chunk ${currentIdx}`);
            } else {
              log('Skipping reupload for chunk (already present on server)', {
                fileId,
                chunkIndex: currentIdx,
              });
            }
            currentIdx++;
          }
          cb();
        } catch (e) {
          cb(e);
        }
      },
      final: async (cb) => {
        try {
          if (acc2.length > 0) {
            const toSend = acc2;
            if (neededSet.has(currentIdx)) {
              const ok = await uploadChunkWithRetry(fileId, currentIdx, toSend);
              if (!ok) throw new Error(`Failed to reupload final chunk ${currentIdx}`);
            } else {
              log('Skipping final chunk reupload (already present)', {
                fileId,
                chunkIndex: currentIdx,
              });
            }
            currentIdx++;
            acc2 = Buffer.alloc(0);
          }
          cb();
        } catch (e) {
          cb(e);
        }
      },
    });

    // Re-run pipeline on original file
    await pipeline(fs.createReadStream(INPUT), gzip2, cipher2, chunker2);

    // After reupload, re-check status
    const statusResp = await axios.get(`${SERVER}/status/${fileId}`);
    const receivedAfter = statusResp.data.received || [];
    const stillMissing = [];
    for (let i = 0; i < totalChunks; i++) {
      if (!receivedAfter.includes(i)) stillMissing.push(i);
    }

    if (stillMissing.length > 0) {
      log('After reupload some chunks are still missing', { fileId, stillMissing });
      throw new Error('Failed to upload all chunks after retries');
    } else {
      log('Reupload successful, all chunks present', { fileId });
    }
  }
})();

