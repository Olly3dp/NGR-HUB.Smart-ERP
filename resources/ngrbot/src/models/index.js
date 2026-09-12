const { sequelize } = require('../config/database');
const User = require('./User');
const Subscription = require('./Subscription');
const BotConfig = require('./BotConfig');
const ConversationHistory = require('./ConversationHistory');

module.exports = {
  sequelize,
  User,
  Subscription,
  BotConfig,
  ConversationHistory
};