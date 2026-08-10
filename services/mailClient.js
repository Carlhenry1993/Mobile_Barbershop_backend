const crypto = require("crypto");
const nodemailer = require("nodemailer");
const sgMail = require("@sendgrid/mail");

const BRAND_NAME = "Mr. Renaudin Barbershop";
const DOMAIN = "mrrenaudinbarbershop.com";
const SHOP_EMAIL = "mrrenaudinbarber@gmail.com";
const SHOP_PHONE = "(514) 778-8318";
const SHOP_ADDRESS = "462 4e Rue de la Pointe, Shawinigan, QC G9N 1G7";
const WEBSITE_URL = "https://mrrenaudinbarbershop.com";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
  || (process.env.SMTP_PASS?.startsWith("SG.") ? process.env.SMTP_PASS : "");

const MAIL_FROM = {
  email: process.env.MAIL_FROM_EMAIL
    || process.env.EMAIL_FROM
    || `notifications@${DOMAIN}`,
  name: process.env.MAIL_FROM_NAME || BRAND_NAME,
};

const DEFAULT_REPLY_TO = {
  email: process.env.MAIL_REPLY_TO || SHOP_EMAIL,
  name: process.env.MAIL_REPLY_TO_NAME || BRAND_NAME,
};

const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL || SHOP_EMAIL;
const UNSUBSCRIBE_EMAIL = process.env.MAIL_UNSUBSCRIBE_EMAIL || SHOP_EMAIL;

let sendGridReady = false;
let smtpTransporter;

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const htmlToText = (html = "") => String(html)
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/p>/gi, "\n\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+\n/g, "\n")
  .replace(/\n\s+/g, "\n")
  .replace(/[ \t]{2,}/g, " ")
  .trim();

const formatAddress = (address) => {
  if (typeof address === "string") return address;
  if (!address?.email) return "";
  return address.name ? `"${address.name}" <${address.email}>` : address.email;
};

const normalizeAddress = (address, fallback) => {
  if (!address) return fallback;
  if (typeof address === "string") return { email: address };
  return address;
};

const getSmtpTransporter = () => {
  if (smtpTransporter) return smtpTransporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  smtpTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });

  return smtpTransporter;
};

const configureSendGrid = () => {
  if (!SENDGRID_API_KEY) return false;
  if (!sendGridReady) {
    sgMail.setApiKey(SENDGRID_API_KEY);
    sendGridReady = true;
  }
  return true;
};

const baseHeaders = (mailType) => ({
  "X-Entity-Ref-ID": crypto.randomUUID(),
  "X-Auto-Response-Suppress": "OOF, AutoReply",
  "Auto-Submitted": "auto-generated",
  ...(mailType === "marketing"
    ? {
        "List-Unsubscribe": `<mailto:${UNSUBSCRIBE_EMAIL}?subject=unsubscribe>`,
        "List-ID": `${BRAND_NAME} <announcements.${DOMAIN}>`,
      }
    : {}),
});

const baseMessage = ({
  to,
  subject,
  html,
  text,
  replyTo,
  headers = {},
  mailType = "transactional",
}) => ({
  to,
  from: MAIL_FROM,
  replyTo: normalizeAddress(replyTo, DEFAULT_REPLY_TO),
  subject: String(subject || "").replace(/\s+/g, " ").trim(),
  text: text || htmlToText(html),
  html,
  headers: {
    ...baseHeaders(mailType),
    ...headers,
  },
});

const sendEmail = async (payload) => {
  if (!payload?.to) return { skipped: true };
  const message = baseMessage(payload);

  if (configureSendGrid()) {
    await sgMail.send({
      ...message,
      categories: [payload.mailType || "transactional"],
      trackingSettings: {
        clickTracking: { enable: false, enableText: false },
        openTracking: { enable: false },
        subscriptionTracking: { enable: false },
      },
    });
    return { provider: "sendgrid" };
  }

  const transporter = getSmtpTransporter();
  if (!transporter) {
    throw new Error("No email provider configured. Set SENDGRID_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS.");
  }

  await transporter.sendMail({
    ...message,
    from: formatAddress(message.from),
    replyTo: formatAddress(message.replyTo),
  });
  return { provider: "smtp" };
};

module.exports = {
  BRAND_NAME,
  CONTACT_TO_EMAIL,
  DEFAULT_REPLY_TO,
  DOMAIN,
  MAIL_FROM,
  SHOP_ADDRESS,
  SHOP_EMAIL,
  SHOP_PHONE,
  WEBSITE_URL,
  escapeHtml,
  sendEmail,
};
