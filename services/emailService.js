const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SMTP_PASS);

const sendContactEmail = async ({ fullName, email, message }) => {
  const msg = {
    to: 'mrrenaudinbarber@gmail.com',
    from: 'mrrenaudinbarber@gmail.com', // Doit être vérifié dans SendGrid
    replyTo: email,
    subject: `Message de ${fullName} - Formulaire de contact`,
    html: `
      <h3>Nouveau message du site</h3>
      <p><b>Nom :</b> ${fullName}</p>
      <p><b>Email :</b> ${email}</p>
      <p><b>Message :</b></p>
      <p>${message.replace(/\n/g, '<br>')}</p>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log('Contact email sent from:', email);
    return { success: true };
  } catch (err) {
    console.error('EMAIL FAILED:', err.message);
    if (err.response) {
      console.error('SendGrid errors:', err.response.body.errors);
    }
    throw new Error('Erreur envoi email');
  }
};

module.exports = { sendContactEmail };