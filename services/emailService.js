const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Email pour notifier le coiffeur
exports.notifyBarber = async (data) => {
  const mailOptions = {
    from: process.env.EMAIL_USER, // Adresse email du service
    to: process.env.BARBER_EMAIL, // Adresse email du coiffeur
    replyTo: data.email, // L'adresse email du client pour répondre directement
    subject: 'Nouvelle réservation à vérifier',
    text: `
      Une nouvelle réservation a été effectuée :
      - Nom complet : ${data.fullName}
      - Numéro de téléphone : ${data.phoneNumber}
      - E-mail : ${data.email}
      - Adresse : ${data.address}
      - Type de rasage : ${data.shavingType}
      - Date préférée : ${data.preferredDate}
      - Heure préférée : ${data.preferredTime}
      - Memo : ${data.memo || 'Aucun'}
      
      Merci de vérifier cette réservation et de confirmer au client.
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email envoyé au coiffeur avec succès');
  } catch (error) {
    console.error("Erreur lors de l'envoi de l'email au coiffeur :", error);
    console.error(`Email envoyé à: ${mailOptions.to}`);
    console.error(error.stack);
    throw error;
  }
};

// Email pour confirmer au client
exports.confirmToClient = async (data) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: data.email,
    subject: 'Confirmation de réservation - Statut: En attente',
    html: `
      <p>Bonjour <strong>${data.fullName}</strong>,</p>
      <p>Nous avons bien reçu votre demande et nous la traitons actuellement. Votre réservation est en statut <strong>"En attente"</strong>. Nous vous contacterons bientôt une fois les détails confirmés pour valider définitivement votre rendez-vous.</p>
      <p><strong>Voici les informations de votre réservation :</strong></p>
      <ul>
        <li><strong>Nom complet :</strong> ${data.fullName}</li>
        <li><strong>Numéro de téléphone :</strong> ${data.phoneNumber}</li>
        <li><strong>E-mail :</strong> ${data.email}</li>
        <li><strong>Adresse :</strong> ${data.address}</li>
        <li><strong>Type de rasage :</strong> ${data.shavingType}</li>
        <li><strong>Date préférée :</strong> ${data.preferredDate}</li>
        <li><strong>Heure préférée :</strong> ${data.preferredTime}</li>
        <li><strong>Memo :</strong> ${data.memo || 'Aucun'}</li>
      </ul>
      <p>Merci d'avoir choisi nos services.</p>
      <p>Cordialement,<br/>L'équipe de Mr. Renaudin Barbershop</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email de confirmation envoyé au client avec succès');
  } catch (error) {
    console.error("Erreur lors de l'envoi de l'email au client :", error);
    console.error(`Email envoyé à: ${mailOptions.to}`);
    console.error(error.stack);
    throw error;
  }
};

// Email pour formulaire de contact
exports.sendContactEmail = async (data) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.BARBER_EMAIL, // Adresse email du coiffeur pour recevoir le message
    replyTo: data.email, // Adresse email du client pour répondre directement
    subject: 'Nouveau message du formulaire de contact',
    text: `
      Nouveau message reçu depuis le formulaire de contact :
      - Nom complet : ${data.fullName}
      - E-mail : ${data.email}
      - Message : ${data.message}
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email de contact envoyé avec succès');
  } catch (error) {
    console.error("Erreur lors de l'envoi de l'email de contact :", error);
    console.error(`Email envoyé à: ${mailOptions.to}`);
    console.error(error.stack);
    throw error;
  }
};

// Email de confirmation de réservation reçue pour le coiffeur
exports.confirmBarberReceipt = async (data) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.BARBER_EMAIL,
    subject: 'Réservation reçue',
    text: `
      Bonjour,

      Une nouvelle réservation a été reçue avec succès. Veuillez la vérifier dans votre agenda.

      Informations de la réservation :
      - Nom complet : ${data.fullName}
      - Téléphone : ${data.phoneNumber}
      - Email : ${data.email}
      - Type de rasage : ${data.shavingType}
      - Date : ${data.preferredDate}
      - Heure : ${data.preferredTime}
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email de confirmation de réception envoyé au coiffeur avec succès');
  } catch (error) {
    console.error("Erreur lors de l'envoi de l'email de confirmation de réception :", error);
    console.error(`Email envoyé à: ${mailOptions.to}`);
    console.error(error.stack);
    throw error;
  }
};
