const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User');

const BotConfig = sequelize.define('BotConfig', {
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
  groqApiKey: {
    type: DataTypes.STRING,
    allowNull: true
  },
  promptSistema: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  flows: {
    type: DataTypes.JSON,
    defaultValue: []
  }
}, {
  timestamps: true
});

User.hasOne(BotConfig, { foreignKey: 'userId' });
BotConfig.belongsTo(User, { foreignKey: 'userId' });

module.exports = BotConfig;