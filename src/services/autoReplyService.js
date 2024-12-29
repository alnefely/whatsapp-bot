const db = require('../config/database');

class AutoReplyService {
    static addReply(deviceId, keyword, response, matchType = 'contains') {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO auto_replies (device_id, keyword, response, match_type)
                VALUES (?, ?, ?, ?)
            `;
            
            db.run(query, [deviceId, keyword, response, matchType], function(err) {
                if (err) {
                    console.error('Error adding reply:', err);
                    reject(err);
                } else {
                    console.log('Reply added successfully');
                    resolve({ id: this.lastID });
                }
            });
        });
    }

    static updateReply(device_id, keyword, newData) {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE auto_replies 
                SET response = ?, match_type = ?
                WHERE device_id = ? AND keyword = ?
            `;
            
            db.run(
                query, 
                [newData.response, newData.match_type || 'contains', device_id, keyword],
                function(err) {
                    if (err) {
                        console.error('Update error:', err);
                        reject(err);
                    } else {
                        if (this.changes > 0) {
                            resolve({
                                success: true,
                                changes: this.changes,
                                message: 'Reply updated successfully'
                            });
                        } else {
                            // إذا لم يتم العثور على الرد، نقوم بإضافته
                            AutoReplyService.addReply(
                                device_id,
                                keyword,
                                newData.response,
                                newData.match_type
                            ).then(result => {
                                resolve({
                                    success: true,
                                    changes: 1,
                                    message: 'Reply added successfully',
                                    added: true
                                });
                            }).catch(reject);
                        }
                    }
                }
            );
        });
    }

    // دالة للتحقق من وجود الرد
    static async checkReplyExists(device_id, keyword) {
        return new Promise((resolve, reject) => {
            const query = 'SELECT id FROM auto_replies WHERE device_id = ? AND keyword = ?';
            db.get(query, [device_id, keyword], (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            });
        });
    }

    static deleteReply(device_id, keyword) {
        return new Promise((resolve, reject) => {
            const query = 'DELETE FROM auto_replies WHERE device_id = ? AND keyword = ?';
            
            db.run(query, [device_id, keyword], function(err) {
                if (err) {
                    console.error('Delete error:', err);
                    reject(err);
                } else {
                    resolve({
                        success: true,
                        changes: this.changes,
                        message: this.changes > 0 ? 
                            'Reply deleted successfully' : 
                            'No matching reply found'
                    });
                }
            });
        });
    }

    // حذف جميع الردود لجهاز معين
    static deleteAllReplies(device_id) {
        return new Promise((resolve, reject) => {
            const query = 'DELETE FROM auto_replies WHERE device_id = ?';
            
            db.run(query, [device_id], function(err) {
                if (err) {
                    console.error('Delete all error:', err);
                    reject(err);
                } else {
                    resolve({
                        success: true,
                        changes: this.changes,
                        message: `Deleted ${this.changes} replies`
                    });
                }
            });
        });
    }

    static getReplies(deviceId) {
        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM auto_replies WHERE device_id = ?';
            
            db.all(query, [deviceId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static findMatchingReply(deviceId, message) {
        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM auto_replies WHERE device_id = ?';
            
            db.all(query, [deviceId], (err, rows) => {
                if (err) {
                    console.error('Error finding reply:', err);
                    reject(err);
                    return;
                }

                console.log('Checking message:', message, 'against', rows.length, 'replies');

                for (const row of rows) {
                    const messageText = message.toLowerCase();
                    const keyword = row.keyword.toLowerCase();

                    let isMatch = false;
                    switch (row.match_type) {
                        case 'exact':
                            isMatch = messageText === keyword;
                            break;
                        case 'contains':
                            isMatch = messageText.includes(keyword);
                            break;
                        case 'startsWith':
                            isMatch = messageText.startsWith(keyword);
                            break;
                        case 'endsWith':
                            isMatch = messageText.endsWith(keyword);
                            break;
                    }

                    if (isMatch) {
                        console.log('Found matching reply:', row);
                        resolve(row);
                        return;
                    }
                }
                resolve(null);
            });
        });
    }
}

module.exports = AutoReplyService;