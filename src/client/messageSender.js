// messageSender.js
// Send encrypted text messages
// Usage: node src/client/messageSender.js <server_base> <message>
// Example: node src/client/messageSender.js http://localhost:3000 "Hello, this is a secret message!"

const axios = require('axios');
const { log } = require('../utils/logger');

const SERVER = process.argv[2] || 'http://localhost:3000';
const MESSAGE = process.argv[3];

if (!MESSAGE) {
  console.error('Usage: node src/client/messageSender.js <server_base> <message>');
  console.error('Example: node src/client/messageSender.js http://localhost:3000 "Hello World"');
  process.exit(1);
}

(async () => {
  try {
    log('Sending message', { server: SERVER, messageLength: MESSAGE.length });

    const response = await axios.post(`${SERVER}/send-message`, {
      message: MESSAGE,
    });

    if (response.data && response.data.ok) {
      log('Message sent successfully', {
        messageId: response.data.messageId,
        decryptedPath: response.data.decryptedPath,
      });
      console.log(`\n✓ Message sent successfully!`);
      console.log(`  Message ID: ${response.data.messageId}`);
      console.log(`  Decrypted file saved to: ${response.data.decryptedPath}`);
      console.log(`\n  To receive this message, use:`);
      console.log(`  npm run receive-message ${SERVER} ${response.data.messageId}`);
    } else {
      throw new Error('Unexpected response from server');
    }
  } catch (err) {
    console.error('Error sending message:', err.response?.data?.error || err.message);
    process.exit(1);
  }
})();

