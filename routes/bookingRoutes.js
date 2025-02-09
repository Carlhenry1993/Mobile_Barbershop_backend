// routes/bookingRoutes.js
const express = require('express');
const bookingController = require('../controllers/bookingController');

const router = express.Router();

// Route POST to create a reservation
router.post('/', bookingController.createReservation);

// Route POST to confirm a reservation
router.post('/confirm', bookingController.confirmReservation);

// Optionally, add a GET route for testing connectivity
router.get('/', (req, res) => {
  res.send('Booking endpoint. Use POST to create or confirm a reservation.');
});

module.exports = router;
