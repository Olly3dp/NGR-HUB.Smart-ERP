const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  groq_key: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  ai_prompt: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  subscription_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  ai_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  auto_flows: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  selected_model: {
    type: DataTypes.STRING,
    defaultValue: 'groq/compound-mini'
  },
  avatar_url: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  timestamps: true
});

module.exports = User;