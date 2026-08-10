const {
  BRAND_NAME,
  CONTACT_TO_EMAIL,
  SHOP_ADDRESS,
  SHOP_EMAIL,
  SHOP_PHONE,
  WEBSITE_URL,
  escapeHtml,
  sendEmail,
} = require("./mailClient");

const sendTransactionalEmail = async ({ to, subject, html, text, replyTo, headers }) => (
  sendEmail({
    to,
    subject,
    html,
    text,
    replyTo,
    headers,
    mailType: "transactional",
  })
);

const sendMarketingEmail = async ({ to, subject, html, text, replyTo, headers }) => (
  sendEmail({
    to,
    subject,
    html,
    text,
    replyTo,
    headers,
    mailType: "marketing",
  })
);

const sendContactEmail = async ({ fullName, email, message }) => {
  const safeName = escapeHtml(fullName);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2933;">
      <h2 style="color: #111827; margin-bottom: 8px;">Nouveau message du site</h2>
      <p style="margin: 0 0 20px;">Un client vient d'envoyer un message depuis ${WEBSITE_URL}.</p>
      <div style="border: 1px solid #e5e7eb; padding: 18px; background: #fafafa;">
        <p><strong>Nom:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Message:</strong></p>
        <p style="line-height: 1.6;">${safeMessage}</p>
      </div>
    </div>
  `;

  await sendTransactionalEmail({
    to: CONTACT_TO_EMAIL,
    replyTo: { email, name: fullName },
    subject: `Nouveau message client - ${fullName}`,
    text: `Nouveau message du site\nNom: ${fullName}\nEmail: ${email}\n\n${message}`,
    html,
  });

  console.log("Contact email sent from:", email);
  return { success: true };
};

const notifyBarber = async (bookingData) => {
  const clientName = bookingData.fullName || bookingData.username || "Client";
  const serviceName = bookingData.serviceName || bookingData.service || "Service";
  const startTime = bookingData.startTime || bookingData.date || "Date a confirmer";

  return sendTransactionalEmail({
    to: SHOP_EMAIL,
    subject: `Nouveau rendez-vous - ${clientName}`,
    text: `Nouveau rendez-vous\nClient: ${clientName}\nService: ${serviceName}\nDate: ${startTime}\nTelephone: ${bookingData.phoneNumber || ""}\nEmail: ${bookingData.email || ""}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <h2>Nouveau rendez-vous</h2>
        <p><strong>Client:</strong> ${escapeHtml(clientName)}</p>
        <p><strong>Service:</strong> ${escapeHtml(serviceName)}</p>
        <p><strong>Date:</strong> ${escapeHtml(startTime)}</p>
        <p><strong>Telephone:</strong> ${escapeHtml(bookingData.phoneNumber || "")}</p>
        <p><strong>Email:</strong> ${escapeHtml(bookingData.email || "")}</p>
      </div>
    `,
    replyTo: bookingData.email ? { email: bookingData.email, name: clientName } : undefined,
  });
};

const confirmToClient = async (bookingData) => {
  const clientName = bookingData.fullName || bookingData.username || "Client";
  const serviceName = bookingData.serviceName || bookingData.service || "Service";
  const startTime = bookingData.startTime || bookingData.date || "Date a confirmer";

  return sendTransactionalEmail({
    to: bookingData.email,
    subject: `Confirmation de rendez-vous - ${BRAND_NAME}`,
    text: `Bonjour ${clientName},\nVotre rendez-vous est ${bookingData.status || "confirme"}.\nService: ${serviceName}\nDate: ${startTime}\n${SHOP_ADDRESS}\n${SHOP_PHONE}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <h2 style="color: #111827;">Votre rendez-vous est confirme</h2>
        <p>Bonjour ${escapeHtml(clientName)},</p>
        <p>Votre rendez-vous chez ${BRAND_NAME} est ${escapeHtml(bookingData.status || "confirme")}.</p>
        <div style="border: 1px solid #e5e7eb; padding: 18px; background: #fafafa;">
          <p><strong>Service:</strong> ${escapeHtml(serviceName)}</p>
          <p><strong>Date:</strong> ${escapeHtml(startTime)}</p>
          <p><strong>Adresse:</strong> ${SHOP_ADDRESS}</p>
          <p><strong>Telephone:</strong> ${SHOP_PHONE}</p>
        </div>
      </div>
    `,
  });
};

module.exports = {
  confirmToClient,
  notifyBarber,
  sendContactEmail,
  sendMarketingEmail,
  sendTransactionalEmail,
};
