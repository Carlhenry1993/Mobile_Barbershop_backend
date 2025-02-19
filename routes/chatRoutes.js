const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { sendMessage } = require('../controllers/chatController');

router.post('/send', async (req, res) => {
  try {
    // Get the token from the Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    let sender;
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // Use decoded username or name if available; otherwise use the id
      sender = decoded.username || decoded.name || decoded.id;
    } else {
      // Fallback to the sender provided in the request body
      sender = req.body.sender;
    }
    
    const { message, recipient } = req.body;
    // Pass the sender as the resolved username to the controller
    const newMessage = await sendMessage({ sender, recipient, message });
    res.status(200).json({ success: true, message: newMessage });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
