const path = require('path');

module.exports = {
    SESSIONS_DIR: path.join(process.cwd(), 'sessions'),
    MAX_RETRIES: 5,
    RETRY_INTERVAL: 3000,
    CONNECTION_TIMEOUT: 60000,
    DB_PATH: path.join(process.cwd(), 'database.sqlite'),
    PORT: process.env.PORT || 3000
};