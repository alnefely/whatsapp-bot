const express = require('express');
const fs = require('fs-extra');
const { SESSIONS_DIR } = require('./config/constants');
const db = require('./config/database');

// Create necessary directories
fs.ensureDirSync(SESSIONS_DIR);

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use('/session', require('./routes/sessionRoutes'));
app.use('/message', require('./routes/messageRoutes'));
app.use('/auto-reply', require('./routes/autoReplyRoutes'));

module.exports = app;