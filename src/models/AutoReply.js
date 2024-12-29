const { Model, DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

class AutoReply extends Model {}

AutoReply.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    sessionId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    trigger: {
        type: DataTypes.STRING,
        allowNull: false
    },
    response: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    responseType: {
        type: DataTypes.STRING,
        defaultValue: 'text',
        validate: {
            isIn: [['text', 'image', 'video', 'pdf', 'audio']]
        }
    },
    mediaUrl: {
        type: DataTypes.STRING,
        allowNull: true
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    sequelize,
    modelName: 'AutoReply',
    tableName: 'auto_replies'
});

module.exports = AutoReply;