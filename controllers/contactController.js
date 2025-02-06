const { sendContactEmail } = require('../services/emailService');

// Contrôleur pour gérer les soumissions du formulaire de contact
const handleContactForm = async (req, res) => {
  const { fullName, email, message } = req.body;

  if (!fullName || !email || !message) {
    return res.status(400).json({ error: 'Tous les champs sont requis.' });
  }

  try {
    await sendContactEmail({ fullName, email, message });
    res.status(200).json({ message: 'Votre message a été envoyé avec succès.' });
  } catch (error) {
    res.status(500).json({ error: 'Une erreur est survenue lors de l\'envoi de votre message.' });
  }
};

module.exports = { handleContactForm };
