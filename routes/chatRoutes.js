const express = require('express');
const router = express.Router();
const { sendMessage } = require('../controllers/chatController');

router.post('/send', (req, res) => {
  const { message } = req.body;
  sendMessage(message);
  res.status(200).json({ success: true });
});

module.exports = router;
