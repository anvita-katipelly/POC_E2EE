/**
 * Media Upload Service for React Native
 * Handles chunking, encryption, and upload of media files with E2EE
 */

import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';
import { SERVER_URL } from '../config/config';
import { encryptAndCompress, generateKeys } from './encryptionService';
import socketService from './socketService';

const CHUNK_SIZE = 512 * 1024; // 512 KB to match server defaults
const TEMP_DIR = RNFS.TemporaryDirectoryPath || RNFS.CachesDirectoryPath;

class MediaUploadService {
  constructor() {
    this.activeUploads = new Map(); // fileId -> upload state
  }

  /**
   * Upload a media file with E2EE and notify the recipient peer.
   * @param {Object} options
   * @param {string} options.fileUri - Local file URI
   * @param {string} options.fileName - Original filename
   * @param {string} options.mimeType - MIME type of file
   * @param {string} options.recipientPhone - Recipient's phone number
   * @param {Function} options.onProgress - Progress callback (progress, fileId)
   * @returns {Promise<Object>} Upload result metadata
   */
  async uploadMedia({ fileUri, fileName, mimeType, recipientPhone, onProgress }) {
    const sanitizedName = this.sanitizeFileName(fileName);
    const fileId = `${Date.now()}_${sanitizedName}`;

    try {
      console.log('[MediaUpload] Starting upload', { fileId, sanitizedName, mimeType });
      this.activeUploads.set(fileId, {
        fileId,
        fileName: sanitizedName,
        mimeType,
        recipientPhone,
        status: 'preparing',
        progress: 0,
      });

      const sourcePath = await this.resolvePath(fileUri);
      const { buffer: fileBuffer, size } = await this.readFileBuffer(sourcePath);

      const { mediaKey, iv } = generateKeys();
      const { ciphertext, hmacHex } = encryptAndCompress(fileBuffer, mediaKey, iv);
      const mediaKeyHex = Buffer.from(mediaKey).toString('hex');
      const ivHex = Buffer.from(iv).toString('hex');

      const totalChunks = Math.ceil(ciphertext.length / CHUNK_SIZE);
      const uploadState = this.activeUploads.get(fileId);
      uploadState.status = 'uploading';
      uploadState.totalChunks = totalChunks;
      uploadState.totalBytes = ciphertext.length;

      for (let index = 0; index < totalChunks; index++) {
        const start = index * CHUNK_SIZE;
        const end = Math.min(ciphertext.length, start + CHUNK_SIZE);
        const chunkBuffer = ciphertext.slice(start, end);

        await this.uploadChunk(fileId, index, chunkBuffer);
        uploadState.uploadedChunks = index + 1;
        uploadState.progress = Math.round(((index + 1) / totalChunks) * 90); // Reserve 10% for finalize

        if (onProgress) {
          onProgress(uploadState.progress, fileId);
        }
      }

      await this.completeUpload({
        fileId,
        fileName: sanitizedName,
        totalChunks,
        mediaKeyHex,
        ivHex,
        hmacHex,
        mimeType,
      });

      uploadState.status = 'notifying';
      uploadState.progress = 95;
      if (onProgress) {
        onProgress(uploadState.progress, fileId);
      }

      await socketService.sendFile({
        to: recipientPhone,
        fileId,
        originalName: sanitizedName,
        totalChunks,
        mimeType,
        size,
      });

      uploadState.status = 'completed';
      uploadState.progress = 100;
      if (onProgress) {
        onProgress(100, fileId);
      }

      console.log('[MediaUpload] Upload completed', { fileId, totalChunks });

      return {
        fileId,
        fileName: sanitizedName,
        mimeType,
        totalChunks,
        size,
      };
    } catch (error) {
      console.error('[MediaUpload] Upload failed', error);
      const uploadState = this.activeUploads.get(fileId);
      if (uploadState) {
        uploadState.status = 'failed';
        uploadState.error = error.message;
      }
      throw error;
    }
  }

  async uploadChunk(fileId, chunkIndex, chunkBuffer) {
    const tempPath = `${TEMP_DIR}/chunk_${fileId}_${chunkIndex}`;
    await RNFS.writeFile(tempPath, chunkBuffer.toString('base64'), 'base64');
    const chunkUri = Platform.OS === 'android' ? `file://${tempPath}` : tempPath;

    const formData = new FormData();
    formData.append('fileId', fileId);
    formData.append('chunkIndex', String(chunkIndex));
    formData.append('chunk', {
      uri: chunkUri,
      name: `${chunkIndex}.chunk`,
      type: 'application/octet-stream',
    });

    const response = await fetch(`${SERVER_URL}/upload-chunk`, {
      method: 'POST',
      body: formData,
    });

    await RNFS.unlink(tempPath).catch(() => null);

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Failed to upload chunk ${chunkIndex}`);
    }
  }

  async completeUpload({ fileId, fileName, totalChunks, mediaKeyHex, ivHex, hmacHex, mimeType }) {
    const response = await fetch(`${SERVER_URL}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId,
        originalName: fileName,
        totalChunks,
        mediaKeyHex,
        ivHex,
        hmacHex,
        mimeType,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Failed to finalize upload');
    }
  }

  async resolvePath(uri) {
    if (!uri) {
      throw new Error('Invalid file URI');
    }

    if (uri.startsWith('file://')) {
      return uri.replace('file://', '');
    }

    if (Platform.OS === 'android' && uri.startsWith('content://')) {
      const tempPath = `${TEMP_DIR}/media_${Date.now()}`;
      await RNFS.copyFile(uri, tempPath);
      return tempPath;
    }

    return uri;
  }

  async readFileBuffer(path) {
    const stat = await RNFS.stat(path);
    const base64Data = await RNFS.readFile(path, 'base64');
    const buffer = Buffer.from(base64Data, 'base64');
    return { buffer, size: Number(stat.size) };
  }

  sanitizeFileName(name) {
    if (!name) {
      return `media_${Date.now()}`;
    }
    return name.replace(/\s+/g, '_');
  }

  formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(1)} ${units[index]}`;
  }

  getUploadState(fileId) {
    return this.activeUploads.get(fileId) || null;
  }

  clearUpload(fileId) {
    this.activeUploads.delete(fileId);
  }
}

export default new MediaUploadService();

