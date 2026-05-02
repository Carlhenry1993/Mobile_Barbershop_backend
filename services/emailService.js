const nodemailer = require("nodemailer");
require("dotenv").config();

/* =========================
   TRANSPORTER (FIXED)
========================= */

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // MUST be Google App Password
  },
});

/* Optional: verify connection on startup */
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Email server error:", error.message);
  } else {
    console.log("✅ Email server ready");
  }
});

/* =========================
   HELPERS
========================= */

const sendEmail = async (mailOptions) => {
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("📧 Email sent:", info.messageId);
    return info;
  } catch (error) {
    console.error("❌ Email sending failed:", error.message);
    throw error;
  }
};

/* =========================
   EMAIL FUNCTIONS
========================= */

exports.notifyBarber = async (data) => {
  return sendEmail({
    from: process.env.EMAIL_USER,
    to: process.env.BARBER_EMAIL,
    replyTo: data.email,
    subject: "Nouvelle réservation à vérifier",
    text: `
Une nouvelle réservation a été effectuée :

- Nom complet : ${data.fullName}
- Téléphone : ${data.phoneNumber}
- E-mail : ${data.email}
- Adresse : ${data.address}
- Type de rasage : ${data.shavingType}
- Date : ${data.preferredDate}
- Heure : ${data.preferredTime}
- Memo : ${data.memo || "Aucun"}
    `,
  });
};

exports.confirmToClient = async (data) => {
  return sendEmail({
    from: process.env.EMAIL_USER,
    to: data.email,
    subject: "Confirmation de réservation",
    html: `
      <p>Bonjour <strong>${data.fullName}</strong>,</p>
      <p>Votre réservation est en <strong>attente</strong>.</p>
      <p>Nous vous contacterons bientôt.</p>
      <ul>
        <li>Nom: ${data.fullName}</li>
        <li>Téléphone: ${data.phoneNumber}</li>
        <li>Adresse: ${data.address}</li>
        <li>Date: ${data.preferredDate}</li>
        <li>Heure: ${data.preferredTime}</li>
      </ul>
      <p>Merci 🙏</p>
    `,
  });
};

exports.sendContactEmail = async (data) => {
  return sendEmail({
    from: process.env.EMAIL_USER,
    to: process.env.BARBER_EMAIL,
    replyTo: data.email,
    subject: "Nouveau message contact",
    text: `
Nom: ${data.fullName}
Email: ${data.email}
Message: ${data.message}
    `,
  });
};

exports.confirmBarberReceipt = async (data) => {
  return sendEmail({
    from: process.env.EMAIL_USER,
    to: process.env.BARBER_EMAIL,
    subject: "Réservation reçue",
    text: `
Nouvelle réservation :

Nom: ${data.fullName}
Téléphone: ${data.phoneNumber}
Email: ${data.email}
Date: ${data.preferredDate}
Heure: ${data.preferredTime}
    `,
  });
};