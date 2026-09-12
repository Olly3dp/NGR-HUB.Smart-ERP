const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User');

const Subscription = sequelize.define('Subscription', {
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
  status: {
    type: DataTypes.STRING,
    defaultValue: 'pending'
  },
  mpPaymentId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  mpPreferenceId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  validUntil: {
    type: DataTypes.DATE,
    allowNull: true
  },
  planType: {
    type: DataTypes.STRING,
    defaultValue: 'pro'
  }
}, {
  timestamps: true
});

User.hasOne(Subscription, { foreignKey: 'userId' });
Subscription.belongsTo(User, { foreignKey: 'userId' });

module.exports = Subscription;