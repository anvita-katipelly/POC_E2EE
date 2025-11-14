// WebSocket client for real-time messaging
// Usage: node src/client/websocketClient.js <server_base> <phoneNumber>
// Example: node src/client/websocketClient.js http://localhost:3000 +1234567890

const io = require('socket.io-client');
const readline = require('readline');
const { uploadFile } = require('./lib/uploadFile');
const { downloadFile } = require('./lib/downloadFile');
const { log } = require('../utils/logger');

const SERVER = process.argv[2] || 'http://localhost:3000';
const PHONE_NUMBER = process.argv[3];

if (!PHONE_NUMBER) {
  console.error('Usage: node src/client/websocketClient.js <server_base> <phoneNumber>');
  console.error('Example: node src/client/websocketClient.js http://localhost:3000 +1234567890');
  process.exit(1);
}

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Connect to server
const socket = io(SERVER, {
  transports: ['websocket', 'polling'],
});

console.log(`\nConnecting to ${SERVER}...`);
console.log(`Phone Number: ${PHONE_NUMBER}\n`);

// Register with phone number
socket.on('connect', () => {
  console.log('✓ Connected to server');
  socket.emit('register', { phoneNumber: PHONE_NUMBER });
});

socket.on('registered', (data) => {
  console.log(`✓ Registered as ${data.phoneNumber}`);
  console.log('\nCommands:');
  console.log('  send <phoneNumber> <message>  - Send a message');
  console.log('  sendfile <phoneNumber> <path> - Upload & notify file');
  console.log('  peers                          - List online peers');
  console.log('  status <phoneNumber>           - Check peer status');
  console.log('  quit                           - Exit\n');
  promptUser();
});

socket.on('message', (data) => {
  if (data.type === 'file') {
    return handleIncomingFile(data);
  }

  console.log(`\n📨 Message from ${data.from}:`);
  console.log(`   ${data.message}`);
  console.log(`   [${new Date(data.timestamp).toLocaleString()}]\n`);
  promptUser();
});

socket.on('offline-messages', async (data) => {
  console.log(`\n📬 You have ${data.messages.length} offline message(s):\n`);
  for (const msg of data.messages) {
    if (msg.type === 'file') {
      await handleIncomingFile(msg, { isOffline: true, suppressPrompt: true });
    } else {
      console.log(`From ${msg.from}: ${msg.message}`);
      console.log(`[${new Date(msg.timestamp).toLocaleString()}]\n`);
    }
  }
  promptUser();
});

socket.on('message-sent', (data) => {
  if (data.type === 'file') {
    console.log(`✓ File notification sent to ${data.to} (ID: ${data.messageId})`);
  } else {
    console.log(`✓ Message sent to ${data.to} (ID: ${data.messageId})`);
  }
  if (data.status === 'offline') {
    console.log('  (Recipient is offline, delivery will occur when they come online)');
  }
  promptUser();
});

socket.on('online-peers', (data) => {
  if (data.peers.length === 0) {
    console.log('No other peers online');
  } else {
    console.log('\nOnline peers:');
    data.peers.forEach((peer) => {
      if (peer.phoneNumber !== PHONE_NUMBER) {
        console.log(`  ${peer.phoneNumber} (connected: ${new Date(peer.connectedAt).toLocaleString()})`);
      }
    });
  }
  promptUser();
});

socket.on('peer-status', (data) => {
  if (data.isOnline) {
    console.log(`✓ ${data.phoneNumber} is online`);
    console.log(`  Connected: ${new Date(data.connectedAt).toLocaleString()}`);
  } else {
    console.log(`✗ ${data.phoneNumber} is offline`);
  }
  promptUser();
});

socket.on('peer-online', (data) => {
  console.log(`\n🟢 ${data.phoneNumber} came online\n`);
  promptUser();
});

socket.on('peer-offline', (data) => {
  console.log(`\n🔴 ${data.phoneNumber} went offline\n`);
  promptUser();
});

socket.on('error', (data) => {
  console.error(`\n❌ Error: ${data.message}\n`);
  promptUser();
});

socket.on('disconnect', () => {
  console.log('\n✗ Disconnected from server');
  process.exit(0);
});

socket.on('connect_error', (error) => {
  console.error(`\n❌ Connection error: ${error.message}`);
  process.exit(1);
});

function promptUser() {
  rl.question('> ', async (input) => {
    const trimmed = input.trim();
    if (!trimmed) {
      return promptUser();
    }

    const [command, ...args] = trimmed.split(' ');
    const action = command.toLowerCase();

    switch (action) {
      case 'send': {
        if (args.length < 2) {
          console.log('Usage: send <phoneNumber> <message>');
          return promptUser();
        }
        const to = args[0];
        const message = args.slice(1).join(' ');
        socket.emit('send-message', { to, message });
        break;
      }

      case 'sendfile': {
        if (args.length < 2) {
          console.log('Usage: sendfile <phoneNumber> <path>');
          return promptUser();
        }
        const to = args[0];
        const filePath = args.slice(1).join(' ');
        await handleSendFile(to, filePath);
        break;
      }

      case 'peers':
        socket.emit('get-online-peers');
        break;

      case 'status':
        if (args.length < 1) {
          console.log('Usage: status <phoneNumber>');
          return promptUser();
        }
        socket.emit('get-peer-status', { phoneNumber: args[0] });
        break;

      case 'quit':
      case 'exit':
        console.log('Goodbye!');
        socket.disconnect();
        rl.close();
        process.exit(0);
        break;

      default:
        if (command) {
          console.log(`Unknown command: ${command}`);
        }
        promptUser();
    }
  });
}

async function handleSendFile(to, filePath) {
  try {
    console.log(`\n⬆️  Uploading "${filePath}"...`);
    const result = await uploadFile(SERVER, filePath, { log });
    console.log(`Upload complete. Notifying ${to} with fileId ${result.fileId}`);
    socket.emit('send-file', {
      to,
      fileId: result.fileId,
      originalName: result.fileName,
      totalChunks: result.totalChunks,
    });
  } catch (err) {
    console.error(`File upload failed: ${err.message}`);
    promptUser();
  }
}

async function handleIncomingFile(data, options = {}) {
  const { isOffline = false, suppressPrompt = false } = options;
  console.log(`\n📁 File shared by ${data.from || 'unknown'}: ${data.originalName || data.fileId}`);
  console.log(`   File ID: ${data.fileId}`);
  console.log(`   ${isOffline ? '(Offline message)' : 'Auto-downloading...'}`);
  try {
    const result = await downloadFile(SERVER, data.fileId, { log });
    console.log(`✓ File downloaded to ${result.outputPath}`);
  } catch (err) {
    console.error(`Failed to download file ${data.fileId}: ${err.message}`);
  } finally {
    if (!suppressPrompt) {
      promptUser();
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nGoodbye!');
  socket.disconnect();
  rl.close();
  process.exit(0);
});

