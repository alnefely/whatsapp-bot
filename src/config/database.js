const sqlite3 = require('sqlite3').verbose();
const { DB_PATH } = require('./constants');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('Database connected successfully');
        initializeTables();
    }
});

function initializeTables() {
    db.run(`
        CREATE TABLE IF NOT EXISTS auto_replies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            keyword TEXT NOT NULL,
            response TEXT NOT NULL,
            match_type TEXT DEFAULT 'contains',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('Table creation error:', err);
        else console.log('Tables created successfully');
    });
}

module.exports = db;