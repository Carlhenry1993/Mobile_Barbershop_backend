const { notifyBarber, confirmToClient } = require('../services/emailService');

exports.createReservation = async (req, res) => {
  const bookingData = req.body;

  // Validation des données reçues (assurez-vous que toutes les informations nécessaires sont présentes)
  if (!bookingData.fullName || !bookingData.phoneNumber || !bookingData.email) {
    return res.status(400).json({
      message: 'Les informations de base (nom, téléphone, email) sont obligatoires.',
    });
  }

  try {
    // Envoyer une notification au coiffeur avec les informations de réservation
    await notifyBarber(bookingData);

    // Envoyer un email au client pour informer que sa réservation est en attente
    await confirmToClient({
      ...bookingData,
      status: 'En attente', // Ajouter le statut de réservation dans les données
    });

    res.status(200).json({
      message: 'Réservation envoyée avec succès. Le coiffeur a été notifié, et un email a été envoyé au client avec le statut en attente.',
    });
  } catch (error) {
    console.error('Erreur lors de la création de la réservation :', error);

    // En fonction de l'erreur, vous pourriez renvoyer des messages différents pour mieux comprendre l'origine du problème.
    const errorMessage = error.message || 'Une erreur est survenue lors de la réservation.';
    
    res.status(500).json({
      message: errorMessage,
    });
  }
};

// Fonction pour confirmer la réservation au client (peut être appelée plus tard)
exports.confirmReservation = async (req, res) => {
  const bookingData = req.body;

  // Validation des données reçues pour la confirmation
  if (!bookingData.email || !bookingData.status) {
    return res.status(400).json({
      message: 'L\'email du client et le statut sont nécessaires pour la confirmation.',
    });
  }

  try {
    // Envoyer un email au client pour confirmer la réservation
    await confirmToClient({
      ...bookingData,
      status: 'Confirmée', // Met à jour le statut à "Confirmée"
    });

    res.status(200).json({
      message: 'Confirmation envoyée au client avec succès.',
    });
  } catch (error) {
    console.error('Erreur lors de la confirmation au client :', error);

    // Renvoi d'un message d'erreur plus détaillé
    const errorMessage = error.message || 'Une erreur est survenue lors de la confirmation.';
    res.status(500).json({
      message: errorMessage,
    });
  }
};
