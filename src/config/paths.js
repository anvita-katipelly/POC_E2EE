// Path configuration
const path = require('path');

const ROOT_DIR = path.join(__dirname, '../..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DECRYPTED_DIR = path.join(DATA_DIR, 'decrypted');

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  UPLOADS_DIR,
  DECRYPTED_DIR,
};

