const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User');

const ConversationHistory = sequelize.define('ConversationHistory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: User, key: 'id' }
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  messages: {
    type: DataTypes.JSON,
    defaultValue: []
  }
}, {
  timestamps: true
});

User.hasMany(ConversationHistory, { foreignKey: 'userId' });
ConversationHistory.belongsTo(User, { foreignKey: 'userId' });

module.exports = ConversationHistory;