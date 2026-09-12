const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middlewares/auth');
const { User } = require('../models');

const MAX_SIZE = 500 * 1024; // 500KB

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../public/uploads/avatars');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'avatar-' + req.session.userId + '-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Apenas imagens (JPEG, JPG, PNG, GIF, WEBP) são permitidas'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: fileFilter
});

router.post('/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    
    const user = await User.findByPk(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    if (user.avatar_url) {
      const oldPath = path.join(__dirname, '../../public', user.avatar_url);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }
    
    const avatarPath = '/uploads/avatars/' + req.file.filename;
    await user.update({ avatar_url: avatarPath });
    
    res.json({ success: true, avatar_url: avatarPath });
  } catch (error) {
    console.error('Erro upload avatar:', error.message);
    res.status(500).json({ error: error.message });
  }
}, (error, req, res, next) => {
  if (error.message.includes('MAX_SIZE')) {
    return res.status(400).json({ error: 'Arquivo muito grande. Máximo 500KB' });
  }
  res.status(400).json({ error: error.message });
});

module.exports = router;