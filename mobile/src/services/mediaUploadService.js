/**
 * Media Upload Service for React Native
 * Handles chunking, encryption, and upload of media files with E2EE
 */

import mediaChunking from '../utils/mediaChunking';
import encryptionService from './encryptionService';
import socketService from './socketService';

class MediaUploadService {
  constructor() {
    this.activeUploads = new Map(); // uploadId -> upload state
  }

  /**
   * Upload a media file with E2EE
   * @param {string} fileUri - Local file URI
   * @param {string} fileName - Original filename
   * @param {string} mimeType - MIME type of file
   * @param {string} recipientPhone - Recipient's phone number
   * @param {Function} onProgress - Progress callback (progress, uploadId)
   * @returns {Promise<string>} Upload ID
   */
  async uploadMedia(fileUri, fileName, mimeType, recipientPhone, onProgress) {
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      console.log(`[MediaUpload] Starting upload: ${uploadId}`);
      console.log(`[MediaUpload] File: ${fileName}, Type: ${mimeType}, Size: ${fileUri}`);
      
      // Initialize upload state
      this.activeUploads.set(uploadId, {
        uploadId,
        fileName,
        mimeType,
        recipientPhone,
        status: 'chunking',
        progress: 0,
        totalChunks: 0,
        uploadedChunks: 0,
      });

      // Step 1: Chunk the file
      const chunks = await mediaChunking.chunkFile(fileUri);
      const totalChunks = chunks.length;
      const totalSize = chunks[0]?.totalSize || 0;

      console.log(`[MediaUpload] File chunked into ${totalChunks} chunks (${mediaChunking.formatBytes(totalSize)})`);

      // Update state
      const uploadState = this.activeUploads.get(uploadId);
      uploadState.status = 'encrypting';
      uploadState.totalChunks = totalChunks;
      uploadState.totalSize = totalSize;

      // Step 2: Generate encryption keys for this upload
      const { mediaKey, iv } = encryptionService.generateKeys();
      const mediaKeyBase64 = encryptionService.bufferToBase64(mediaKey);
      const ivBase64 = encryptionService.bufferToBase64(iv);

      console.log(`[MediaUpload] Generated encryption keys for upload`);

      // Step 3: Encrypt and upload each chunk
      uploadState.status = 'uploading';
      const encryptedChunks = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        console.log(`[MediaUpload] Processing chunk ${i + 1}/${totalChunks}`);
        
        // Validate chunk data
        if (!chunk) {
          console.error(`[MediaUpload] Chunk ${i + 1} is null or undefined!`);
          throw new Error(`Chunk ${i + 1} is null - data loading failed`);
        }

        if (!chunk.data) {
          console.error(`[MediaUpload] Chunk ${i + 1} has no data property!`, {
            chunkKeys: Object.keys(chunk),
            chunkData: chunk.data,
            chunkType: typeof chunk,
          });
          throw new Error(`Chunk ${i + 1} data is missing - check mediaChunking output`);
        }

        if (typeof chunk.data !== 'string') {
          console.error(`[MediaUpload] Chunk ${i + 1} data is not a string!`, {
            dataType: typeof chunk.data,
            isBuffer: Buffer.isBuffer(chunk.data),
            dataValue: chunk.data,
          });
          throw new Error(`Chunk ${i + 1} data must be base64 string, got: ${typeof chunk.data}`);
        }

        if (chunk.data.length === 0) {
          console.error(`[MediaUpload] Chunk ${i + 1} data is empty string!`);
          throw new Error(`Chunk ${i + 1} data is empty`);
        }

        try {
          console.log(`[MediaUpload] Encrypting chunk ${i + 1}/${totalChunks}`);
          
          // Convert base64 chunk data to Buffer
          const chunkBuffer = encryptionService.base64ToBuffer(chunk.data);
          console.log(`[MediaUpload] Chunk ${i + 1} converted to Buffer, length: ${chunkBuffer.length}`);
          
          // Encrypt chunk data
          const { ciphertext, hmacHex } = encryptionService.encryptAndCompress(
            chunkBuffer,
            mediaKey,
            iv
          );

          const encryptedChunk = {
            uploadId,
            index: chunk.index,
            totalChunks: chunk.totalChunks,
            encryptedData: encryptionService.bufferToBase64(ciphertext),
            hmac: hmacHex,
            size: chunk.size,
            totalSize: chunk.totalSize,
          };

          encryptedChunks.push(encryptedChunk);

          // Update progress
          uploadState.uploadedChunks = i + 1;
          uploadState.progress = Math.round((i + 1) / totalChunks * 100);
          
          if (onProgress) {
            onProgress(uploadState.progress, uploadId);
          }

          console.log(`[MediaUpload] Chunk ${i + 1}/${totalChunks} encrypted (${uploadState.progress}%)`);
        } catch (chunkError) {
          console.error(`[MediaUpload] Error processing chunk ${i + 1}:`, chunkError);
          throw new Error(`Failed to process chunk ${i + 1}: ${chunkError.message}`);
        }
      }

      // Step 4: Send media metadata and chunks to server
      console.log(`[MediaUpload] Sending media to ${recipientPhone}`);
      
      await socketService.sendMedia({
        uploadId,
        fileName,
        mimeType,
        totalSize,
        totalChunks,
        recipientPhone,
        mediaKey: mediaKeyBase64,
        iv: ivBase64,
        chunks: encryptedChunks,
      });

      // Mark as complete
      uploadState.status = 'completed';
      uploadState.progress = 100;
      
      if (onProgress) {
        onProgress(100, uploadId);
      }

      console.log(`[MediaUpload] Upload completed: ${uploadId}`);
      
      return uploadId;
    } catch (error) {
      console.error('[MediaUpload] Upload failed:', error);
      
      const uploadState = this.activeUploads.get(uploadId);
      if (uploadState) {
        uploadState.status = 'failed';
        uploadState.error = error.message;
      }
      
      throw error;
    }
  }

  /**
   * Get upload state
   * @param {string} uploadId - Upload ID
   * @returns {Object|null} Upload state or null
   */
  getUploadState(uploadId) {
    return this.activeUploads.get(uploadId) || null;
  }

  /**
   * Cancel an active upload
   * @param {string} uploadId - Upload ID to cancel
   */
  cancelUpload(uploadId) {
    const uploadState = this.activeUploads.get(uploadId);
    if (uploadState) {
      uploadState.status = 'cancelled';
      console.log(`[MediaUpload] Upload cancelled: ${uploadId}`);
    }
  }

  /**
   * Clear upload state
   * @param {string} uploadId - Upload ID to clear
   */
  clearUpload(uploadId) {
    this.activeUploads.delete(uploadId);
  }
}

// Export singleton instance
export default new MediaUploadService();

