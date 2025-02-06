const express = require('express');
const bookingController = require('../controllers/bookingController');  // Assurez-vous que ce chemin est correct

const router = express.Router();

// Route POST pour créer une réservation
router.post('/', bookingController.createReservation);

// Route POST pour confirmer une réservation
router.post('/confirm', bookingController.confirmReservation);

module.exports = router;
