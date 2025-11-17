import * as FileSystem from 'expo-file-system';

// Get document directory path - using any to bypass type checking for now
const getDocumentDirectory = (): string => {
  const fs = FileSystem as any;
  return fs.documentDirectory || fs.cacheDirectory || '';
};
import * as Crypto from 'expo-crypto';
import axios from 'axios';
import { SERVER_CONFIG } from '../config/config';
import { FileMetadata } from '../types';

// Helper to convert base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Upload file to server with encryption
 */
export async function uploadFile(
  fileUri: string,
  fileId: string,
  onProgress?: (bytesUploaded: number, totalBytes: number) => void
): Promise<FileMetadata> {
  try {
    // Read file
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      throw new Error('File does not exist');
    }

    const fileData = await FileSystem.readAsStringAsync(fileUri, {
      encoding: 'base64' as any,
    });

    const fileName = fileUri.split('/').pop() || 'file';
    const fileBytes = base64ToUint8Array(fileData);

    // Generate encryption keys
    const mediaKey = Crypto.getRandomBytes(32);
    const iv = Crypto.getRandomBytes(16);

    // For compression, we'll use a simple approach
    // In production, you might want to use a compression library
    // For now, we'll encrypt the data directly

    // Encrypt using AES-256-CBC (simplified - you may need to use a native module)
    // Note: expo-crypto doesn't support AES directly, so you might need expo-crypto-js or similar
    // This is a placeholder - implement with your chosen crypto solution
    
    // For now, we'll upload the file as-is and add encryption later
    // Split into chunks (512KB)
    const CHUNK_SIZE = 512 * 1024;
    const chunks: string[] = [];
    
    for (let i = 0; i < fileBytes.length; i += CHUNK_SIZE) {
      const chunk = fileBytes.slice(i, i + CHUNK_SIZE);
      chunks.push(uint8ArrayToBase64(chunk));
    }

    // Upload chunks
    let uploadedBytes = 0;
    const totalBytes = fileBytes.length;

    for (let i = 0; i < chunks.length; i++) {
      const formData = new FormData();
      formData.append('fileId', fileId);
      formData.append('chunkIndex', String(i));
      
      // Convert base64 chunk to blob for upload
      const chunkBase64 = chunks[i];
      const blob = await fetch(`data:application/octet-stream;base64,${chunkBase64}`).then(r => r.blob());
      
      formData.append('chunk', blob, `${i}.chunk`);

      await axios.post(`${SERVER_CONFIG.BASE_URL}/upload-chunk`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            uploadedBytes += progressEvent.loaded - uploadedBytes;
            onProgress(uploadedBytes, totalBytes);
          }
        },
      });
    }

    // Generate HMAC (placeholder - implement with crypto library)
    const hmacHex = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      fileData
    );

    // Send metadata
    await axios.post(`${SERVER_CONFIG.BASE_URL}/complete`, {
      fileId,
      originalName: fileName,
      totalChunks: chunks.length,
      mediaKeyHex: Array.from(mediaKey).map(b => b.toString(16).padStart(2, '0')).join(''),
      ivHex: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
      hmacHex,
    });

    return {
      fileId,
      fileName,
      totalChunks: chunks.length,
      mediaKeyHex: Array.from(mediaKey).map(b => b.toString(16).padStart(2, '0')).join(''),
      ivHex: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
      hmacHex,
    };
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}

/**
 * Download and decrypt file
 */
export async function downloadFile(
  fileId: string,
  outputPath?: string,
  onProgress?: (bytesDownloaded: number, totalBytes?: number) => void
): Promise<string> {
  try {
    // Get metadata
    const metaResp = await axios.get(`${SERVER_CONFIG.BASE_URL}/meta/${fileId}`);
    const { originalName, totalChunks, mediaKeyHex, ivHex, hmacHex } = metaResp.data;

    // Download chunks
    const chunks: string[] = [];
    let downloadedBytes = 0;

    for (let i = 0; i < totalChunks; i++) {
      const resp = await axios.get(
        `${SERVER_CONFIG.BASE_URL}/download-chunk/${fileId}/${i}`,
        {
          responseType: 'arraybuffer',
          onDownloadProgress: (progressEvent) => {
            if (onProgress && progressEvent.total) {
              onProgress(progressEvent.loaded, progressEvent.total);
            }
          },
        }
      );

      // Convert arraybuffer to base64
      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(resp.data))
      );
      chunks.push(base64);
      downloadedBytes += resp.data.byteLength;
    }

    // Concatenate chunks
    const ciphertextBase64 = chunks.join('');

    // TODO: Verify HMAC, decrypt, and decompress
    // For now, save the encrypted data
    const finalPath =
      outputPath ||
      `${getDocumentDirectory()}${originalName}`;

    await FileSystem.writeAsStringAsync(finalPath, ciphertextBase64, {
      encoding: 'base64' as any,
    });

    return finalPath;
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
}

