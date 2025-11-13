# Local Encrypted File Transfer (Node.js POC)

This project demonstrates a **Proof of Concept (PoC)** for secure local file transfer between two clients through a **media server**, all running on the same WiFi network. It includes compression, AES encryption, key exchange, and decryption of files.

---

## Overview

### Architecture

```
Client 1 (Sender)
│
│ 1. Compresses + Encrypts file (AES)
│ 2. Generates media key + HMAC
│ 3. Uploads encrypted chunks to server
▼
Media Server
│
│ 4. Stores encrypted chunks & metadata
│ 5. Provides API endpoints for retrieval
▼
Client 2 (Receiver)
│
│ 6. Requests file metadata and chunks
│ 7. Verifies HMAC and decrypts
│ 8. Decompresses and restores original file
▼
Output: Original file recovered
```

---

## Project Structure

```
POC_E2EE/
├── src/
│   ├── server/              # Server-side code
│   │   ├── routes/          # API route handlers
│   │   │   ├── uploadRoutes.js
│   │   │   ├── downloadRoutes.js
│   │   │   └── debugRoutes.js
│   │   ├── services/        # Business logic
│   │   │   ├── encryptionService.js
│   │   │   └── fileService.js
│   │   ├── storage/         # Storage management
│   │   │   └── metadataStore.js
│   │   ├── app.js           # Express app configuration
│   │   └── index.js         # Server entry point
│   ├── client/              # Client scripts
│   │   ├── sender.js        # File upload client
│   │   └── receiver.js      # File download client
│   ├── utils/               # Shared utilities
│   │   ├── logger.js
│   │   ├── crypto.js
│   │   └── fileUtils.js
│   └── config/              # Configuration
│       ├── constants.js
│       └── paths.js
├── data/                    # Data directories (gitignored)
│   ├── uploads/             # Encrypted chunks storage
│   └── decrypted/           # Decrypted files output
├── package.json
├── README.md
└── .gitignore
```

---

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Run the Media Server

```bash
npm start
# or
node src/server/index.js
```

Server runs by default on `http://0.0.0.0:3000` (accessible from all network interfaces).

### 3. Send a File

```bash
npm run sender <server_base> <input_file>
# or
node src/client/sender.js <server_base> <input_file>
```

**Example:**
```bash
node src/client/sender.js http://192.168.61.42:3000 /path/to/sample.jpg
```

This will:
- Compress the file (using Gzip)
- Encrypt it using AES-256-CBC
- Generate a media key and IV
- Upload encrypted chunks to the server
- Store metadata (key, IV, HMAC) on the server

**Expected output:**
```
[timestamp] Starting upload { fileId: 'sample.jpg', fileName: 'sample.jpg', size: 245760 }
[timestamp] Uploaded chunk { fileId: 'sample.jpg', chunkIndex: 0, bytes: 524288, attempt: 0 }
...
[timestamp] All chunks uploaded (initial pass) { fileId: 'sample.jpg', totalChunks: 3, ... }
[timestamp] Posted /complete metadata { fileId: 'sample.jpg' }
[timestamp] All chunks confirmed by server { fileId: 'sample.jpg', totalChunks: 3 }
[timestamp] Upload finished { fileId: 'sample.jpg' }
>>> IMPORTANT: Keep this fileId to retrieve the file: sample.jpg
```

### 4. Receive a File

**Option A: Using the API endpoint (recommended)**

```bash
curl -O http://192.168.61.42:3000/receive/sample.jpg
```

Or use in a browser/Postman:
```
GET http://192.168.61.42:3000/receive/sample.jpg
```

**Option B: Using the receiver script**

```bash
npm run receiver <server_base> <fileId>
# or
node src/client/receiver.js <server_base> <fileId>
```

**Example:**
```bash
node src/client/receiver.js http://192.168.61.42:3000 sample.jpg
```

This will:
- Fetch metadata from the server
- Download all encrypted chunks
- Verify HMAC integrity
- Decrypt and decompress the file
- Save the restored file to `data/decrypted/`

**Expected output:**
```
[timestamp] Metadata fetched { originalName: 'sample.jpg', totalChunks: 3 }
[timestamp] Downloaded chunk { chunkIndex: 0, bytes: 524288 }
...
[timestamp] Saved ciphertext { path: 'data/decrypted/sample.jpg.bin' }
[timestamp] HMAC verified OK
[timestamp] Decrypted { compressedBytes: 173456 }
[timestamp] File recovered { path: 'data/decrypted/sample.jpg', size: 245760 }

Done — file recovered to: data/decrypted/sample.jpg
```

---

## API Endpoints

### Upload Endpoints

- **POST `/upload-chunk`** - Upload a chunk of encrypted data
  - Body (form-data): `fileId`, `chunkIndex`, `chunk` (file)
  - Returns: `{ ok: true, chunkIndex: number }`

- **POST `/complete`** - Store metadata after all chunks uploaded
  - Body (JSON): `{ fileId, originalName, totalChunks, mediaKeyHex, ivHex, hmacHex }`
  - Returns: `{ ok: true }`

### Download Endpoints

- **GET `/meta/:fileId`** - Get metadata for a file
  - Returns: `{ originalName, totalChunks, mediaKeyHex, ivHex, hmacHex, createdAt }`

- **GET `/download-chunk/:fileId/:index`** - Download a specific chunk
  - Returns: Chunk file (binary)

- **GET `/receive/:fileId`** - Receive and decrypt media file (API endpoint)
  - Returns: Decrypted file as download with original filename

- **GET `/status/:fileId`** - Get upload status
  - Returns: `{ fileId, received: number[], totalChunks: number | null }`

### Debug Endpoints

- **GET `/health`** - Health check
  - Returns: `{ ok: true, ts: string }`

- **GET `/list/:fileId`** - List all chunks for a file (debug)
  - Returns: `{ files: string[] }`

---

## Security Flow

| Step | Description |
|------|-------------|
| 1 | Sender compresses file using Gzip |
| 2 | Sender encrypts compressed data with AES-256-CBC using a randomly generated key |
| 3 | Sender computes HMAC-SHA256 over ciphertext for integrity verification |
| 4 | Sender uploads encrypted chunks to server |
| 5 | Sender stores metadata (key, IV, HMAC) on server |
| 6 | Receiver fetches metadata and chunks from server |
| 7 | Receiver verifies HMAC to ensure data integrity |
| 8 | Receiver decrypts and decompresses to restore original file |

### Security Considerations

**WARNING:** This PoC passes the AES key through the media server, which is **not secure for production use**. In real-world scenarios, keys should be exchanged via secure channels such as:
- Diffie-Hellman key exchange
- TLS/SSL encryption
- Public-key encryption (RSA, ECC)
- End-to-end encrypted messaging protocols

The media server should never have access to decryption keys. Consider implementing:
- Out-of-band key exchange
- Client-side key derivation
- Asymmetric encryption for key wrapping
- Perfect forward secrecy

---

## Configuration

Configuration is managed in `src/config/constants.js`:

- **Server**: Port, host, JSON limit
- **Upload**: Chunk size, retry settings, timeout
- **Crypto**: Algorithm, key sizes, HMAC settings
- **Compression**: Algorithm (gzip)

Paths are configured in `src/config/paths.js` and can be customized.

---

## Dependencies

- **express** - Web framework for the media server
- **axios** - HTTP client for file transfers
- **crypto** - AES encryption/decryption (Node.js built-in)
- **zlib** - File compression (Node.js built-in)
- **multer** - File upload handling
- **form-data** - Form data handling for multipart uploads
- **cors** - Cross-origin resource sharing
- **sharp** (optional) - Advanced image compression

---

## Usage Notes

- All components (server, sender, receiver) must be on the same network
- The server stores encrypted chunks in `data/uploads/` directory
- Decrypted files are saved to `data/decrypted/` directory
- File metadata (including encryption keys) are stored in memory on the server
- The server should implement cleanup mechanisms for old files in production
- Chunks are uploaded with retry logic for reliability
- The system verifies chunk integrity after upload

---

## Development

### Running in Development

```bash
# Start server
npm start

# In another terminal, send a file
npm run sender http://localhost:3000 /path/to/file.jpg

# In another terminal, receive the file
npm run receiver http://localhost:3000 file.jpg
```

### Code Organization

- **Routes** (`src/server/routes/`) - Handle HTTP requests and responses
- **Services** (`src/server/services/`) - Business logic (encryption, file operations)
- **Storage** (`src/server/storage/`) - Data storage management
- **Utils** (`src/utils/`) - Reusable utility functions
- **Config** (`src/config/`) - Configuration constants and paths

---

## License

ISC
