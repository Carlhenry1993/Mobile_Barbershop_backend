```js id="l0n6qv"
// controllers/bookingController.js

const { notifyBarber, confirmToClient } = require('../services/emailService');

const SHOP_HOURS = {
  0: { start: 11, end: 17 }, // Dimanche
  1: { start: 11, end: 19 }, // Lundi
  2: { start: 11, end: 19 }, // Mardi
  3: { start: 11, end: 19 }, // Mercredi
  4: { start: 11, end: 19 }, // Jeudi
  5: { start: 11, end: 19 }, // Vendredi
  6: { start: 12, end: 19 }, // Samedi
};

// ─────────────────────────────────────────────
// Vérifie si le créneau respecte l'horaire
// ─────────────────────────────────────────────
function isValidBookingTime(dateString) {
  const bookingDate = new Date(dateString);

  const day = bookingDate.getDay();
  const hour = bookingDate.getHours();
  const minutes = bookingDate.getMinutes();

  const hours = SHOP_HOURS[day];

  if (!hours) {
    return false;
  }

  const bookingTime = hour + minutes / 60;

  return (
    bookingTime >= hours.start &&
    bookingTime < hours.end
  );
}

// ─────────────────────────────────────────────
// Création réservation
// ─────────────────────────────────────────────
exports.createReservation = async (req, res) => {
  const bookingData = req.body;

  // Validation des champs obligatoires
  if (
    !bookingData.fullName ||
    !bookingData.phoneNumber ||
    !bookingData.email
  ) {
    return res.status(400).json({
      message:
        'Les informations de base (nom, téléphone, email) sont obligatoires.',
    });
  }

  // Validation date/heure réservation
  if (!bookingData.startTime) {
    return res.status(400).json({
      message: 'La date et l’heure du rendez-vous sont obligatoires.',
    });
  }

  // Vérifier l'horaire du salon
  const validTime = isValidBookingTime(bookingData.startTime);

  if (!validTime) {
    return res.status(400).json({
      message:
        'Ce créneau est en dehors des horaires du barbershop.',
    });
  }

  try {

    // ─────────────────────────────────────────
    // Ici vous pouvez ajouter :
    // - sauvegarde DB
    // - vérification conflit réservation
    // - génération ID réservation
    // ─────────────────────────────────────────


    // Notification barbier
    await notifyBarber(bookingData);

    // Email client
    await confirmToClient({
      ...bookingData,
      status: 'En attente',
    });

    res.status(200).json({
      message:
        'Réservation envoyée avec succès. Le coiffeur a été notifié et un email a été envoyé au client.',
    });

  } catch (error) {

    console.error(
      'Erreur lors de la création de la réservation :',
      error
    );

    const errorMessage =
      error.message ||
      'Une erreur est survenue lors de la réservation.';

    res.status(500).json({
      message: errorMessage,
    });
  }
};

// ─────────────────────────────────────────────
// Confirmation réservation
// ─────────────────────────────────────────────
exports.confirmReservation = async (req, res) => {
  const bookingData = req.body;

  if (!bookingData.email || !bookingData.status) {
    return res.status(400).json({
      message:
        "L'email du client et le statut sont nécessaires pour la confirmation.",
    });
  }

  try {

    await confirmToClient({
      ...bookingData,
      status: 'Confirmée',
    });

    res.status(200).json({
      message:
        'Confirmation envoyée au client avec succès.',
    });

  } catch (error) {

    console.error(
      'Erreur lors de la confirmation au client :',
      error
    );

    const errorMessage =
      error.message ||
      'Une erreur est survenue lors de la confirmation.';

    res.status(500).json({
      message: errorMessage,
    });
  }
};
```
