// messageReceiver.js
// Receive and decrypt text messages
// Usage: node src/client/messageReceiver.js <server_base> <messageId>
// Example: node src/client/messageReceiver.js http://localhost:3000 msg_1234567890_abc123

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { DECRYPTED_DIR } = require('../config/paths');
const { ensureDirectory } = require('../utils/fileUtils');
const { log } = require('../utils/logger');

const SERVER = process.argv[2] || 'http://localhost:3000';
const MESSAGE_ID = process.argv[3];

if (!MESSAGE_ID) {
  console.error('Usage: node src/client/messageReceiver.js <server_base> <messageId>');
  console.error('Example: node src/client/messageReceiver.js http://localhost:3000 msg_1234567890_abc123');
  process.exit(1);
}

// Ensure output directory exists
ensureDirectory(DECRYPTED_DIR);

(async () => {
  try {
    log('Receiving message', { server: SERVER, messageId: MESSAGE_ID });

    const response = await axios.get(`${SERVER}/receive-message/${MESSAGE_ID}`, {
      responseType: 'text',
    });

    const message = response.data;
    log('Message received and decrypted', { messageId: MESSAGE_ID, messageLength: message.length });

    // Save message to file
    const outPath = path.join(DECRYPTED_DIR, `${MESSAGE_ID}.txt`);
    fs.writeFileSync(outPath, message, 'utf8');
    log('Message saved', { path: outPath });

    console.log(`\n✓ Message received and decrypted!`);
    console.log(`\nMessage:`);
    console.log('─'.repeat(50));
    console.log(message);
    console.log('─'.repeat(50));
    console.log(`\nSaved to: ${outPath}`);
  } catch (err) {
    if (err.response?.status === 404) {
      console.error(`Error: Message not found (ID: ${MESSAGE_ID})`);
    } else {
      console.error('Error receiving message:', err.response?.data?.error || err.message);
    }
    process.exit(1);
  }
})();

