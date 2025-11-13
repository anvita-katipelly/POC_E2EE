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
▼
Media Server
│
│ 3. Temporarily stores encrypted file & key
▼
Client 2 (Receiver)
│
│ 4. Requests file + key from server
│ 5. Decrypts and restores original file
▼
Output: Original file recovered
```

---

## Components

| File | Description |
|------|-------------|
| `server.js` | Acts as the media relay between clients. Stores files and media keys temporarily. |
| `sender.js` | Compresses, encrypts, and uploads a file to the media server. |
| `receiver.js` | Downloads the encrypted file and decrypts it using the key fetched from the server. |
| `package.json` | Node.js dependencies and scripts. |

---

## Setup

### 1. Install Dependencies

```bash
npm install express axios crypto fs zlib multer
```

Optional (for image compression):
```bash
npm install sharp
```

### 2. Run the Media Server

```bash
node server.js
```

Server runs by default on `http://localhost:3000`.

### 3. Send a File

```bash
node sender.js sample.jpg
```

This will:
- Compress the image (using Gzip or Sharp)
- Encrypt it using AES-256
- Generate a media key
- Upload both encrypted file and metadata to the media server

Expected output:
```
Original file size: 245 KB
Compressed file size: 173 KB
Encrypted file size: 176 KB
Generated Media Key: xNksrNhDaEqKZKkbK0LZ3A==
Uploading encrypted file to server...
File uploaded successfully!
```

### 4. Receive a File

```bash
node receiver.js http://localhost:3000 sample.jpg
```

This will:
- Fetch the encrypted file and key from the media server
- Decrypt it using the key
- Save the restored file under `/decrypted/`

Expected output:
```
Fetching media key for filename from server...
File downloaded and decrypted successfully!
Saved to: decrypted/sample.jpg
```

---

## Security Flow

| Step | Description |
|------|-------------|
| 1 | Sender compresses and encrypts the file with a randomly generated AES-256 key (media key). |
| 2 | File and key are uploaded to the media server. |
| 3 | Receiver fetches the encrypted file and key using the filename. |
| 4 | Receiver decrypts using the same AES key. |
| 5 | Original file is restored and saved locally. |

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

## Project Structure

```
project/
├── decrypted/          # Output directory for receiver
├── uploads/            # Temporary storage on server
├── sender.js           # Client that sends encrypted files
├── receiver.js         # Client that receives and decrypts files
├── server.js           # Media server
├── package.json        # Dependencies
└── README.md           # This file
```

---

## Dependencies

- **express** - Web framework for the media server
- **axios** - HTTP client for file transfers
- **crypto** - AES encryption/decryption
- **zlib** - File compression
- **multer** - File upload handling
- **sharp** (optional) - Advanced image compression

---

## Usage Notes

- All three components (server, sender, receiver) must be on the same network
- The server stores files temporarily in the `uploads/` directory
- Decrypted files are saved to the `decrypted/` directory
- File metadata including encryption keys are stored in memory on the server
- The server should implement cleanup mechanisms for old files

---
