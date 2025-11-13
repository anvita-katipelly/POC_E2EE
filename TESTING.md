# Testing Guide

This guide will help you test the E2EE media server with automatic file processing.

## Prerequisites

1. Make sure dependencies are installed:
```bash
npm install
```

2. Ensure you have a test file (e.g., `test.jpg` or any file you want to upload)

## Test Scenario 1: Basic Upload and Auto-Processing

### Step 1: Start the Server

Open Terminal 1:
```bash
npm start
```

You should see:
```
[timestamp] Media server started { host: '0.0.0.0', port: 3000 }
Media server listening on http://0.0.0.0:3000
```

### Step 2: Send a File

Open Terminal 2 (on the same machine or different machine on same network):
```bash
# On same machine
npm run sender http://localhost:3000 /path/to/your/file.jpg

# On different machine (use server's IP)
npm run sender http://192.168.61.42:3000 /path/to/your/file.jpg
```

**Example:**
```bash
npm run sender http://localhost:3000 test.jpg
```

### Step 3: Verify Auto-Processing

Watch Terminal 1 (server logs). You should see:
- Chunk uploads being logged
- When all chunks are received: `[timestamp] Auto-processing file`
- `[timestamp] File automatically processed and saved`

Check the `data/decrypted/` folder:
```bash
ls -lh data/decrypted/
```

You should see:
- `yourfile.jpg.bin` (ciphertext)
- `yourfile.jpg` (decrypted file)

### Step 4: Verify File Integrity

Compare the original and decrypted file:
```bash
# Check file sizes
ls -lh test.jpg
ls -lh data/decrypted/test.jpg

# Compare checksums (if available)
md5 test.jpg
md5 data/decrypted/test.jpg
```

---

## Test Scenario 2: Receive File via API

### Step 1: Start the Server (if not already running)
```bash
npm start
```

### Step 2: Upload a File
```bash
npm run sender http://localhost:3000 test.jpg
```

### Step 3: Download via API

**Using curl:**
```bash
curl -O http://localhost:3000/receive/test.jpg
```

**Using browser:**
Navigate to: `http://localhost:3000/receive/test.jpg`

**Using Postman:**
- Method: GET
- URL: `http://localhost:3000/receive/test.jpg`
- The file will download automatically

---

## Test Scenario 3: Auto-Receiver (Receiver Machine)

### Step 1: Start Server (on sender machine)
```bash
npm start
```

### Step 2: Start Auto-Receiver (on receiver machine)
```bash
npm run auto-receiver http://192.168.61.42:3000
```

### Step 3: Upload File (on sender machine)
```bash
npm run sender http://192.168.61.42:3000 test.jpg
```

### Step 4: Watch Auto-Receiver
The auto-receiver will:
- Poll the server every 5 seconds
- Detect when file is complete
- Automatically download, decrypt, and save to `data/decrypted/`

---

## Test Scenario 4: Manual Receiver

### Step 1: Upload File
```bash
npm run sender http://localhost:3000 test.jpg
```

Note the fileId from the output (e.g., `test.jpg`)

### Step 2: Receive File
```bash
npm run receiver http://localhost:3000 test.jpg
```

The file will be downloaded, decrypted, and saved to `data/decrypted/`

---

## Test Scenario 5: Check Server Status

### Check Available Files
```bash
curl http://localhost:3000/list-files
```

Response will show all files with their completion status.

### Check File Status
```bash
curl http://localhost:3000/status/test.jpg
```

### Check File Metadata
```bash
curl http://localhost:3000/meta/test.jpg
```

### Health Check
```bash
curl http://localhost:3000/health
```

---

## Test Scenario 6: Large File Upload

Test with a larger file to verify chunking works:

```bash
# Upload a large file (e.g., video)
npm run sender http://localhost:3000 file_example_MP4_1920_18MG.mp4

# Monitor server logs to see chunk uploads
# Verify file is automatically processed when complete
```

---

## Troubleshooting

### Server not starting
- Check if port 3000 is already in use
- Verify Node.js is installed: `node --version`

### Chunks not uploading
- Check network connectivity
- Verify server IP address is correct
- Check server logs for errors

### File not auto-processing
- Check server logs for errors
- Verify all chunks were uploaded (check `/status/:fileId`)
- Verify metadata was stored (check `/meta/:fileId`)

### Files not appearing in decrypted folder
- Check `data/decrypted/` directory exists
- Check server logs for processing errors
- Verify file permissions

### Network Issues
- Ensure sender, receiver, and server are on same network
- Check firewall settings
- Verify server is accessible: `curl http://SERVER_IP:3000/health`

---

## Quick Test Commands

```bash
# 1. Start server
npm start

# 2. In another terminal, upload a file
npm run sender http://localhost:3000 test.jpg

# 3. Check if file was auto-processed
ls -lh data/decrypted/

# 4. Download via API
curl -O http://localhost:3000/receive/test.jpg

# 5. Check server status
curl http://localhost:3000/list-files
```

---

## Expected Server Logs

When everything works correctly, you should see:

```
[timestamp] Uploaded chunk { fileId: 'test.jpg', chunkIndex: 0, bytes: 524288, ... }
[timestamp] Uploaded chunk { fileId: 'test.jpg', chunkIndex: 1, bytes: 524288, ... }
[timestamp] File upload complete (metadata stored) { fileId: 'test.jpg', ... }
[timestamp] Auto-processing file { fileId: 'test.jpg', originalName: 'test.jpg', ... }
[timestamp] Saved ciphertext { fileId: 'test.jpg', path: '...' }
[timestamp] File decrypted and decompressed { fileId: 'test.jpg', ... }
[timestamp] File automatically processed and saved { fileId: 'test.jpg', ... }
```

---

## Testing Checklist

- [ ] Server starts successfully
- [ ] File uploads successfully (chunks)
- [ ] File is automatically decrypted when all chunks received
- [ ] Decrypted file appears in `data/decrypted/`
- [ ] Decrypted file matches original (size/checksum)
- [ ] API endpoint `/receive/:fileId` works
- [ ] Status endpoint `/status/:fileId` shows correct chunk count
- [ ] List files endpoint `/list-files` shows all files
- [ ] Auto-receiver detects and processes new files
- [ ] Large files (>1MB) upload and process correctly

