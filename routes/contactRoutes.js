const express = require('express');
const { handleContactForm } = require('../controllers/contactController');

const router = express.Router();

// Route POST pour le formulaire de contact
router.post('/', handleContactForm);

module.exports = router;
