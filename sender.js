// sender.js (robust with retries + status verification)
// Usage: node sender.js http://localhost:3000 /path/to/file.ext

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const axios = require('axios');
const stream = require('stream');
const { promisify } = require('util');

const pipeline = promisify(stream.pipeline);

// CONFIG
const SERVER = process.argv[2] || 'http://localhost:3000';
const INPUT = process.argv[3];
if (!INPUT || !fs.existsSync(INPUT)) {
  console.error('Usage: node sender.js <server_base> <input_file>');
  process.exit(1);
}
const CHUNK_SIZE = 512 * 1024; // 512 KB
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 300; // base backoff

function log(msg, meta = {}) {
  console.log(`[${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? meta : '');
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const fileName = path.basename(INPUT);
  const fileStat = fs.statSync(INPUT);
  // const fileId = crypto.randomUUID();
  const fileId = fileName;
  log('Starting upload', { fileId, fileName, size: fileStat.size });

  // prepare crypto and compression
  const gzip = zlib.createGzip();
  const mediaKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', mediaKey, iv);
  const hmac = crypto.createHmac('sha256', mediaKey);

  // chunk accumulator
  let idx = 0;
  let acc = Buffer.alloc(0);
  const uploadedIndices = [];

  // chunk upload function with retry
  async function uploadChunkWithRetry(fileId, chunkIndex, buf) {
    let attempt = 0;
    while (attempt < MAX_RETRIES) {
      try {
        // form-data upload
        const FormData = require('form-data');
        const form = new FormData();
        form.append('fileId', fileId);
        form.append('chunkIndex', String(chunkIndex));
        form.append('chunk', buf, { filename: `${chunkIndex}.chunk` });

        const headers = form.getHeaders();
        await axios.post(`${SERVER}/upload-chunk`, form, { headers, maxBodyLength: Infinity, timeout: 15000 });
        log('Uploaded chunk', { fileId, chunkIndex, bytes: buf.length, attempt });
        return true;
      } catch (err) {
        attempt++;
        const wait = RETRY_BASE_MS * Math.pow(2, attempt);
        log('Chunk upload failed, retrying', { fileId, chunkIndex, attempt, err: err.message, waitMs: wait });
        await sleep(wait);
      }
    }
    log('Chunk upload failed permanently', { fileId, chunkIndex });
    return false;
  }

  // chunker writable that uploads whenever CHUNK_SIZE reached
  const chunker = new stream.Writable({
    write: async (chunk, _enc, cb) => {
      try {
        // update HMAC with ciphertext bytes
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
    }
  });

  try {
    // pipeline: read -> gzip -> cipher -> chunker
    await pipeline(fs.createReadStream(INPUT), gzip, cipher, chunker);

    const totalChunks = idx;
    const hmacHex = hmac.digest('hex');
    log('All chunks uploaded (initial pass)', { fileId, totalChunks, uploadedCount: uploadedIndices.length, hmacHex });

    // POST /complete metadata
    await axios.post(`${SERVER}/complete`, {
      fileId, originalName: fileName, totalChunks, mediaKeyHex: mediaKey.toString('hex'),
      ivHex: iv.toString('hex'), hmacHex
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
      log('Server missing chunks detected — reuploading missing chunks', { fileId, missingCount: missing.length, missing });
      // Reconstruct ciphertext locally by reading from upload temporary storage? We didn't save ciphertext chunks locally earlier.
      // For simplicity in this POC: we will re-generate the ciphertext by re-streaming and re-slicing to find specific chunk bytes.
      // Efficient approach: store each chunk to local temp dir as we uploaded; here we will re-upload by re-reading original file and reprocessing.
      // Re-create ciphertext stream and slice, reupload only missing indices
      await reuploadMissingChunks(fileId, missing, totalChunks);
    }

    log('Upload finished', { fileId });
    console.log('>>> IMPORTANT: Keep this fileId to retrieve the file:', fileId);
  } catch (err) {
    console.error('Upload pipeline failed:', err.message);
    process.exit(1);
  }

  // Re-stream the pipeline and capture buffers for missing chunks and send them.
  // This function recreates ciphertext and re-uploads the specified missing indices.
  async function reuploadMissingChunks(fileId, missingIndices, totalChunks) {
    log('Re-streaming file to re-create ciphertext for missing chunks', { fileId });

    // Map of index -> Buffer for only the indices we need (to avoid storing everything)
    const neededSet = new Set(missingIndices);
    let currentIdx = 0;
    let acc2 = Buffer.alloc(0);

    // create new streams
    const gzip2 = zlib.createGzip();
    const cipher2 = crypto.createCipheriv('aes-256-cbc', mediaKey, iv);

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
              log('Skipping reupload for chunk (already present on server)', { fileId, chunkIndex: currentIdx });
            }
            currentIdx++;
          }
          cb();
        } catch (e) { cb(e); }
      },
      final: async (cb) => {
        try {
          if (acc2.length > 0) {
            const toSend = acc2;
            if (neededSet.has(currentIdx)) {
              const ok = await uploadChunkWithRetry(fileId, currentIdx, toSend);
              if (!ok) throw new Error(`Failed to reupload final chunk ${currentIdx}`);
            } else {
              log('Skipping final chunk reupload (already present)', { fileId, chunkIndex: currentIdx });
            }
            currentIdx++;
            acc2 = Buffer.alloc(0);
          }
          cb();
        } catch (e) { cb(e); }
      }
    });

    // re-run pipeline on original file
    await pipeline(fs.createReadStream(INPUT), gzip2, cipher2, chunker2);

    // after reupload, re-check status
    const statusResp = await axios.get(`${SERVER}/status/${fileId}`);
    const receivedAfter = statusResp.data.received || [];
    const stillMissing = [];
    for (let i = 0; i < totalChunks; i++) if (!receivedAfter.includes(i)) stillMissing.push(i);

    if (stillMissing.length > 0) {
      log('After reupload some chunks are still missing', { fileId, stillMissing });
      throw new Error('Failed to upload all chunks after retries');
    } else {
      log('Reupload successful, all chunks present', { fileId });
    }
  }

})();
