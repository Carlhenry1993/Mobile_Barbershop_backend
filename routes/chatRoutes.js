const express = require('express');
const router = express.Router();
const { sendMessage } = require('../controllers/chatController');

router.post('/send', async (req, res) => {
  try {
    const { message, sender, recipient } = req.body;
    const newMessage = await sendMessage({ sender, recipient, message });
    res.status(200).json({ success: true, message: newMessage });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
