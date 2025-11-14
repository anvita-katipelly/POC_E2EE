const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const axios = require('axios');
const stream = require('stream');
const { promisify } = require('util');
const FormData = require('form-data');
const { generateMediaKey, generateIV, createCipher, createHMAC } = require('../../utils/crypto');
const { log } = require('../../utils/logger');
const { UPLOAD } = require('../../config/constants');

const pipeline = promisify(stream.pipeline);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function uploadFile(serverBase, inputPath, options = {}) {
  const logger = options.log || log;
  const fileId = options.fileId || path.basename(inputPath);
  const chunkSize = options.chunkSize || UPLOAD.CHUNK_SIZE;
  const maxRetries = options.maxRetries || UPLOAD.MAX_RETRIES;
  const retryBaseMs = options.retryBaseMs || UPLOAD.RETRY_BASE_MS;
  const timeout = options.timeout || UPLOAD.TIMEOUT;

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  const fileStat = fs.statSync(inputPath);
  const fileName = path.basename(inputPath);

  logger('Starting upload', { serverBase, fileId, fileName, size: fileStat.size });

  const gzip = zlib.createGzip();
  const mediaKey = generateMediaKey();
  const iv = generateIV();
  const cipher = createCipher(mediaKey, iv);
  const hmac = createHMAC(mediaKey);

  let chunkIndex = 0;
  let accumulator = Buffer.alloc(0);

  async function uploadChunkWithRetry(currentIndex, buffer) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const form = new FormData();
        form.append('fileId', fileId);
        form.append('chunkIndex', String(currentIndex));
        form.append('chunk', buffer, { filename: `${currentIndex}.chunk` });

        await axios.post(`${serverBase}/upload-chunk`, form, {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          timeout,
        });

        logger('Uploaded chunk', { fileId, chunkIndex: currentIndex, bytes: buffer.length, attempt });
        return true;
      } catch (err) {
        attempt++;
        const waitMs = retryBaseMs * Math.pow(2, attempt);
        logger('Chunk upload failed, retrying', {
          fileId,
          chunkIndex: currentIndex,
          attempt,
          error: err.message,
          waitMs,
        });
        await sleep(waitMs);
      }
    }

    logger('Chunk upload failed permanently', { fileId, chunkIndex: currentIndex });
    return false;
  }

  const chunker = new stream.Writable({
    write: async (chunk, _enc, callback) => {
      try {
        hmac.update(chunk);
        accumulator = Buffer.concat([accumulator, chunk]);

        while (accumulator.length >= chunkSize) {
          const toSend = accumulator.slice(0, chunkSize);
          accumulator = accumulator.slice(chunkSize);
          const currentIndex = chunkIndex++;
          const success = await uploadChunkWithRetry(currentIndex, toSend);
          if (!success) throw new Error(`Failed to upload chunk ${currentIndex}`);
        }

        callback();
      } catch (err) {
        callback(err);
      }
    },
    final: async (callback) => {
      try {
        if (accumulator.length > 0) {
          const currentIndex = chunkIndex++;
          const success = await uploadChunkWithRetry(currentIndex, accumulator);
          if (!success) throw new Error(`Failed to upload final chunk ${currentIndex}`);
        }

        callback();
      } catch (err) {
        callback(err);
      }
    },
  });

  await pipeline(fs.createReadStream(inputPath), gzip, cipher, chunker);

  const totalChunks = chunkIndex;
  const hmacHex = hmac.digest('hex');

  await axios.post(`${serverBase}/complete`, {
    fileId,
    originalName: fileName,
    totalChunks,
    mediaKeyHex: mediaKey.toString('hex'),
    ivHex: iv.toString('hex'),
    hmacHex,
  });

  logger('Posted /complete metadata', { fileId, totalChunks });

  async function fetchReceivedChunks() {
    const statusResp = await axios.get(`${serverBase}/status/${fileId}`);
    return statusResp.data.received || [];
  }

  async function reuploadMissingChunks(missingIndices) {
    if (missingIndices.length === 0) {
      return;
    }

    logger('Re-streaming file to recover missing chunks', { fileId, missingCount: missingIndices.length });

    const needed = new Set(missingIndices);
    let currentIndex = 0;
    let cache = Buffer.alloc(0);

    const gzip2 = zlib.createGzip();
    const cipher2 = createCipher(mediaKey, iv);

    const chunker2 = new stream.Writable({
      write: async (chunk, _enc, callback) => {
        try {
          cache = Buffer.concat([cache, chunk]);

          while (cache.length >= chunkSize) {
            const toSend = cache.slice(0, chunkSize);
            cache = cache.slice(chunkSize);

            if (needed.has(currentIndex)) {
              const success = await uploadChunkWithRetry(currentIndex, toSend);
              if (!success) throw new Error(`Failed to reupload chunk ${currentIndex}`);
            }

            currentIndex++;
          }

          callback();
        } catch (err) {
          callback(err);
        }
      },
      final: async (callback) => {
        try {
          if (cache.length > 0) {
            if (needed.has(currentIndex)) {
              const success = await uploadChunkWithRetry(currentIndex, cache);
              if (!success) throw new Error(`Failed to reupload final chunk ${currentIndex}`);
            }
            currentIndex++;
          }

          callback();
        } catch (err) {
          callback(err);
        }
      },
    });

    await pipeline(fs.createReadStream(inputPath), gzip2, cipher2, chunker2);
  }

  const received = await fetchReceivedChunks();
  const missing = [];
  for (let i = 0; i < totalChunks; i++) {
    if (!received.includes(i)) missing.push(i);
  }

  if (missing.length > 0) {
    await reuploadMissingChunks(missing);

    const after = await fetchReceivedChunks();
    const stillMissing = [];
    for (let i = 0; i < totalChunks; i++) {
      if (!after.includes(i)) stillMissing.push(i);
    }

    if (stillMissing.length > 0) {
      throw new Error(`Failed to upload chunks: ${stillMissing.join(', ')}`);
    }
  }

  logger('Upload finished', { fileId, totalChunks });

  return {
    fileId,
    fileName,
    totalChunks,
    mediaKeyHex: mediaKey.toString('hex'),
    ivHex: iv.toString('hex'),
    hmacHex,
  };
}

module.exports = {
  uploadFile,
};

