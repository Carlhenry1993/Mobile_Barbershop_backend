const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const jwt = require('jsonwebtoken');
const sgMail = require('@sendgrid/mail');

// ─── EMAIL CONFIG SENDGRID API ───────────────────────────────────────────────
console.log('--- SENDGRID API INIT ---');
console.log('API KEY set:',!!process.env.SMTP_PASS);

sgMail.setApiKey(process.env.SMTP_PASS);

// ─── INFOS BARBERSHOP ───────────────────────────────────────────────
const SHOP_INFO = {
  name: 'Mr. Renaudin Barbershop',
  email: 'mrrenaudinbarber@gmail.com',
  phone: '(819) 555-0199', // Change si besoin
  address: '462 4e Rue de la Pointe',
  city: 'Shawinigan, QC G9N 1G7',
  website: 'https://mrrenaudinbarbershop.com'
};

const FROM_EMAIL = {
  email: 'reservations@mrrenaudinbarbershop.com', // Change après Domain Auth
  name: 'Mr. Renaudin Barbershop'
};

const sendBookingEmail = async (to, subject, html, text) => {
  if (!to) {
    console.log('Email skip: no recipient');
    return;
  }

  console.log('Sending email to:', to);

  const msg = {
    to,
    from: FROM_EMAIL,
    replyTo: SHOP_INFO.email,
    subject,
    text,
    html,
  };

  try {
    await sgMail.send(msg);
    console.log('Email sent to:', to);
  } catch (err) {
    console.error('EMAIL FAILED:', err.message);
    if (err.response) {
      console.error('SendGrid errors:', err.response.body.errors);
    }
  }
};

// ─── Middlewares ────────────────────────────────────────────────
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Non autorisé" });
  }
  try {
    req.user = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token invalide" });
  }
};

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Non autorisé" });
  }
  try {
    const user = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    if (user.role!== 'admin') return res.status(403).json({ error: "Accès admin requis" });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token invalide" });
  }
};

// ─── CLIENT ROUTES ──────────────────────────────────────────────

router.get('/services', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, duration, price, description FROM services WHERE active = true ORDER BY price'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching services:', err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get('/barbers', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username as name, b.specialties, b.avatar_url
       FROM users u
       JOIN barbers b ON u.id = b.user_id
       WHERE u.role = 'barber' AND b.active = true
       ORDER BY u.username`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching barbers:', err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get('/availability', async (req, res) => {
  const { date, barberId, serviceId } = req.query;
  if (!date ||!barberId ||!serviceId) {
    return res.status(400).json({ error: "date, barberId, serviceId requis" });
  }

  try {
    const serviceRes = await pool.query('SELECT duration FROM services WHERE id = $1 AND active = true', [serviceId]);
    if (!serviceRes.rows.length) return res.status(404).json({ error: "Service introuvable" });
    const duration = serviceRes.rows[0].duration;

    const dayOfWeek = new Date(date + 'T12:00:00Z').getUTCDay();
    const scheduleRes = await pool.query(
      'SELECT start_time, end_time FROM barber_schedules WHERE barber_id = $1 AND day_of_week = $2',
      [barberId, dayOfWeek]
    );
    if (!scheduleRes.rows.length) return res.json([]);

    const { start_time, end_time } = scheduleRes.rows[0];

    const bookingsRes = await pool.query(
      `SELECT start_time, end_time FROM bookings
       WHERE barber_id = $1 AND DATE(start_time) = $2 AND status!= 'cancelled'
       UNION ALL
       SELECT start_time, end_time FROM barber_blocks
       WHERE barber_id = $1 AND DATE(start_time) = $2`,
      [barberId, date]
    );

    const slots = [];
    const workStart = new Date(`${date}T${start_time}Z`);
    const workEnd = new Date(`${date}T${end_time}Z`);
    const now = new Date();

    for (let slot = new Date(workStart); slot < workEnd; slot.setMinutes(slot.getMinutes() + 15)) {
      const slotEnd = new Date(slot.getTime() + duration * 60000);
      if (slotEnd > workEnd) break;

      const isBooked = bookingsRes.rows.some(b => {
        const bStart = new Date(b.start_time);
        const bEnd = new Date(b.end_time);
        return (slot < bEnd && slotEnd > bStart);
      });

      if (!isBooked && slot > now) {
        slots.push(slot.toISOString());
      }
    }

    res.json(slots);
  } catch (err) {
    console.error('Error fetching availability:', err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post('/create', authenticate, async (req, res) => {
  const { serviceId, barberId, startTime } = req.body;
  const clientId = req.user.id;

  if (!serviceId ||!barberId ||!startTime) {
    return res.status(400).json({ error: "Champs manquants" });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const serviceRes = await client.query('SELECT name, duration, price FROM services WHERE id = $1 AND active = true', [serviceId]);
    if (!serviceRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Service introuvable" });
    }
    const { name: serviceName, duration, price } = serviceRes.rows[0];
    const start = new Date(startTime);
    const endTime = new Date(start.getTime() + duration * 60000);

    if (start < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Impossible de réserver dans le passé" });
    }

    const conflict = await client.query(
      `SELECT id FROM bookings
       WHERE barber_id = $1 AND status!= 'cancelled'
       AND ($2, $3) OVERLAPS (start_time, end_time)
       UNION ALL
       SELECT id FROM barber_blocks
       WHERE barber_id = $1 AND ($2, $3) OVERLAPS (start_time, end_time)`,
      [barberId, start, endTime]
    );

    if (conflict.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: "Ce créneau vient d'être réservé" });
    }

    const [clientRes, barberRes] = await Promise.all([
      client.query('SELECT username, email FROM users WHERE id = $1', [clientId]),
      client.query('SELECT username, email FROM users WHERE id = $1', [barberId])
    ]);

    const result = await client.query(
      `INSERT INTO bookings (client_id, barber_id, service_id, start_time, end_time, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'confirmed', NOW()) RETURNING *`,
      [clientId, barberId, serviceId, start, endTime]
    );

    await client.query('COMMIT');

    const booking = result.rows[0];
    const clientEmail = clientRes.rows[0]?.email;
    const clientName = clientRes.rows[0]?.username;
    const barberEmail = barberRes.rows[0]?.email;
    const barberName = barberRes.rows[0]?.username;

    console.log('Client email:', clientEmail);
    console.log('Barber email:', barberEmail);

    const dateStr = start.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Toronto'
    });
    const timeStr = start.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Toronto'
    });
    const bookingId = booking.id;

    // ─── EMAIL CLIENT ───
    const clientSubject = `Confirmation de réservation #${bookingId} - ${SHOP_INFO.name}`;
    const clientText = `
Bonjour ${clientName},

Merci d'avoir choisi ${SHOP_INFO.name}. Votre réservation est confirmée.

RÉCAPITULATIF DE VOTRE RENDEZ-VOUS
Numéro de confirmation : ${bookingId}
Service : ${serviceName}
Professionnel : ${barberName}
Date : ${dateStr}
Heure : ${timeStr}
Durée estimée : ${duration} minutes
Montant : ${price}$ CAD

LIEU DU RENDEZ-VOUS
${SHOP_INFO.name}
${SHOP_INFO.address}
${SHOP_INFO.city}

CONTACT
Téléphone : ${SHOP_INFO.phone}
Courriel : ${SHOP_INFO.email}
Site web : ${SHOP_INFO.website}

INFORMATIONS IMPORTANTES
- Merci de vous présenter 5 minutes avant l'heure prévue.
- Annulation ou modification gratuite jusqu'à 24 heures avant le rendez-vous.
- Au-delà de ce délai, le service pourra être facturé.
- Pour gérer votre réservation : ${SHOP_INFO.website}/compte

Nous avons hâte de vous accueillir.

Cordialement,
L'équipe ${SHOP_INFO.name}
`;

    const clientHtml = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmation de réservation</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f5f5f5;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#ffffff;border:1px solid #d9d9d9;max-width:600px;">
          <tr>
            <td style="background-color:#0e1015;padding:35px;text-align:center;border-bottom:3px solid #d4a843;">
              <h1 style="margin:0;color:#d4a843;font-family:Georgia,serif;font-size:26px;font-weight:bold;letter-spacing:2px;">
                ${SHOP_INFO.name.toUpperCase()}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:35px 40px;">
              <h2 style="margin:0 0 20px;color:#1a1a1a;font-size:20px;font-weight:bold;">
                Réservation confirmée
              </h2>
              <p style="margin:0 0 25px;color:#333333;font-size:15px;line-height:1.6;">
                Bonjour ${clientName},<br><br>
                Merci d'avoir choisi ${SHOP_INFO.name}. Votre réservation est confirmée. Vous trouverez ci-dessous tous les détails de votre rendez-vous.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #d9d9d9;margin-bottom:25px;">
                <tr>
                  <td style="background-color:#f8f8f8;padding:12px 20px;border-bottom:1px solid #d9d9d9;">
                    <p style="margin:0;color:#666666;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">
                      Numéro de confirmation
                    </p>
                    <p style="margin:4px 0 0;color:#0e1015;font-size:16px;font-weight:bold;">
                      ${bookingId}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="6" cellspacing="0" role="presentation">
                      <tr>
                        <td style="color:#666666;font-size:13px;width:130px;padding:6px 0;">Service réservé</td>
                        <td style="color:#1a1a1a;font-size:14px;font-weight:bold;padding:6px 0;">${serviceName}</td>
                      </tr>
                      <tr>
                        <td style="color:#666666;font-size:13px;padding:6px 0;">Professionnel</td>
                        <td style="color:#1a1a1a;font-size:14px;padding:6px 0;">${barberName}</td>
                      </tr>
                      <tr>
                        <td style="color:#666666;font-size:13px;padding:6px 0;">Date</td>
                        <td style="color:#1a1a1a;font-size:14px;padding:6px 0;">${dateStr}</td>
                      </tr>
                      <tr>
                        <td style="color:#666666;font-size:13px;padding:6px 0;">Heure</td>
                        <td style="color:#1a1a1a;font-size:14px;font-weight:bold;padding:6px 0;">${timeStr}</td>
                      </tr>
                      <tr>
                        <td style="color:#666666;font-size:13px;padding:6px 0;">Durée prévue</td>
                        <td style="color:#1a1a1a;font-size:14px;padding:6px 0;">${duration} minutes</td>
                      </tr>
                      <tr>
                        <td style="color:#666666;font-size:13px;padding:6px 0;">Montant</td>
                        <td style="color:#1a1a1a;font-size:14px;font-weight:bold;padding:6px 0;">${price}$ CAD</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f8f8f8;border-left:3px solid #d4a843;margin-bottom:25px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 6px;color:#666666;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">
                      Lieu du rendez-vous
                    </p>
                    <p style="margin:0;color:#1a1a1a;font-size:14px;line-height:1.6;">
                      <strong>${SHOP_INFO.name}</strong><br>
                      ${SHOP_INFO.address}<br>
                      ${SHOP_INFO.city}
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:25px;">
                <tr>
                  <td style="padding:16px;background-color:#fffbf0;border:1px solid #d4a843;">
                    <p style="margin:0;color:#1a1a1a;font-size:13px;line-height:1.6;">
                      <strong>Politique d'annulation :</strong> Vous pouvez annuler ou modifier votre rendez-vous sans frais jusqu'à 24 heures avant l'heure prévue. Passé ce délai, le service pourra être facturé.
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding:10px 0;">
                    <a href="${SHOP_INFO.website}/compte" style="display:inline-block;background-color:#d4a843;color:#0e1015;text-decoration:none;padding:13px 30px;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;border:1px solid #d4a843;">
                      Gérer ma réservation
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#0e1015;padding:30px 40px;text-align:center;">
              <p style="margin:0 0 12px;color:#ffffff;font-size:14px;font-weight:bold;letter-spacing:1px;">
                ${SHOP_INFO.name.toUpperCase()}
              </p>
              <p style="margin:0 0 6px;color:#b8c8da;font-size:12px;line-height:1.8;">
                ${SHOP_INFO.address}<br>
                ${SHOP_INFO.city}
              </p>
              <p style="margin:12px 0 0;color:#b8c8da;font-size:12px;line-height:1.8;">
                Téléphone : ${SHOP_INFO.phone}<br>
                Courriel : <a href="mailto:${SHOP_INFO.email}" style="color:#d4a843;text-decoration:none;">${SHOP_INFO.email}</a><br>
                Site web : <a href="${SHOP_INFO.website}" style="color:#d4a843;text-decoration:none;">${SHOP_INFO.website}</a>
              </p>
              <p style="margin:20px 0 0;color:#7888a0;font-size:11px;">
                Ce courriel a été envoyé à ${clientEmail}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    await sendBookingEmail(clientEmail, clientSubject, clientHtml, clientText);

    // ─── EMAIL BARBIER ───
    const barberSubject = `Nouveau rendez-vous #${bookingId} - ${clientName} ${timeStr}`;
    const barberText = `
NOUVELLE RÉSERVATION

Un nouveau rendez-vous vient d'être ajouté à votre horaire.

INFORMATIONS CLIENT
Nom : ${clientName}
Courriel : ${clientEmail}

DÉTAILS DU RENDEZ-VOUS
Numéro de réservation : ${bookingId}
Service : ${serviceName}
Date : ${dateStr}
Heure : ${timeStr}
Durée : ${duration} minutes
Montant : ${price}$ CAD

Le client a reçu un courriel de confirmation automatique contenant tous les détails et la politique d'annulation.

${SHOP_INFO.name}
${SHOP_INFO.phone}
${SHOP_INFO.email}
`;

    const barberHtml = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f5f5f5;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#ffffff;border:1px solid #d9d9d9;max-width:600px;">
          <tr>
            <td style="background-color:#0e1015;padding:25px 35px;text-align:center;border-bottom:3px solid #d4a843;">
              <h1 style="margin:0;color:#d4a843;font-family:Georgia,serif;font-size:22px;font-weight:bold;letter-spacing:1px;">
                NOUVELLE RÉSERVATION
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:35px;">
              <p style="margin:0 0 25px;color:#333333;font-size:14px;line-height:1.6;">
                Un nouveau rendez-vous vient d'être ajouté à votre horaire.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #d9d9d9;margin-bottom:20px;">
                <tr>
                  <td style="background-color:#f8f8f8;padding:12px 20px;border-bottom:1px solid #d9d9d9;">
                    <p style="margin:0;color:#666666;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">
                      Informations client
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 8px;color:#1a1a1a;font-size:17px;font-weight:bold;">
                      ${clientName}
                    </p>
                    <p style="margin:0;color:#666666;font-size:13px;">
                      ${clientEmail}
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #d9d9d9;">
                <tr>
                  <td style="background-color:#0e1015;padding:12px 20px;">
                    <p style="margin:0;color:#d4a843;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">
                      Détails du rendez-vous
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="6" cellspacing="0" role="presentation">
                      <tr>
                        <td style="color:#666666;font-size:13px;width:140px;padding:6px 0;">Numéro</td>
                        <td style="color:#1a1a1a;font-size:14px;font-weight:bold;padding:6px 0;">${bookingId}</td>
                      </tr>
                      <tr>
                        <td style="color:#666666;font-size:13px;padding:6px 0;">Service</td>
                        <td style="color:#1a1a1a;font-size:14px;font-weight:bold;padding:6px 0;">${serviceName}</td>
                      </tr>
                      <tr>
                        <td style="color:#666666;font-size:13px;padding:6px 0;">Date</td>
                        <td style="color:#1a1a1a;font-size:14px;padding:6px 0;">${dateStr}</td>
                      </tr>
                      <tr>
                        <td style="color:#666666;font-size:13px;padding:6px 0;">Heure</td>
                        <td style="color:#1a1a1a;font-size:14px;font-weight:bold;padding:6px 0;">${timeStr}</td>
                      </tr>
                      <tr>
                        <td style="color:#666666;font-size:13px;padding:6px 0;">Durée</td>
                        <td style="color:#1a1a1a;font-size:14px;padding:6px 0;">${duration} minutes</td>
                      </tr>
                      <tr>
                        <td style="color:#666666;font-size:13px;padding:6px 0;">Montant</td>
                        <td style="color:#1a1a1a;font-size:14px;font-weight:bold;padding:6px 0;">${price}$ CAD</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:25px 0 0;color:#666666;font-size:13px;text-align:center;line-height:1.6;">
                Le client a reçu un courriel de confirmation automatique avec tous les détails et la politique d'annulation.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#0e1015;padding:25px 35px;text-align:center;">
              <p style="margin:0 0 8px;color:#ffffff;font-size:13px;font-weight:bold;">
                ${SHOP_INFO.name}
              </p>
              <p style="margin:0;color:#b8c8da;font-size:11px;line-height:1.8;">
                ${SHOP_INFO.address}, ${SHOP_INFO.city}<br>
                ${SHOP_INFO.phone} | ${SHOP_INFO.email}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    await sendBookingEmail(barberEmail, barberSubject, barberHtml, barberText);

    res.json(booking);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Booking ERROR:', err.message);
    res.status(500).json({ error: "Erreur serveur lors de la réservation" });
  } finally {
    client.release();
  }
});

router.get('/my-bookings', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.id, b.start_time, b.end_time, b.status,
              s.name as service_name, s.price, s.duration,
              u.username as barber_name, u.id as barber_id
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       JOIN users u ON b.barber_id = u.id
       WHERE b.client_id = $1
       ORDER BY b.start_time DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching my bookings:', err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch('/:id', authenticate, async (req, res) => {
  const { startTime } = req.body;
  const bookingId = req.params.id;

  if (!startTime) return res.status(400).json({ error: "startTime requis" });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bookingRes = await client.query(
      `SELECT b.*, s.duration FROM bookings b
       JOIN services s ON b.service_id = s.id
       WHERE b.id = $1 AND b.client_id = $2 AND b.status = 'confirmed'
       AND b.start_time > NOW() + INTERVAL '24 hours'`,
      [bookingId, req.user.id]
    );

    if (!bookingRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Impossible de modifier. Moins de 24h ou résa introuvable" });
    }

    const oldBooking = bookingRes.rows[0];
    const newStart = new Date(startTime);
    const newEnd = new Date(newStart.getTime() + oldBooking.duration * 60000);

    const conflict = await client.query(
      `SELECT id FROM bookings
       WHERE barber_id = $1 AND status!= 'cancelled' AND id!= $2
       AND ($3, $4) OVERLAPS (start_time, end_time)
       UNION ALL
       SELECT id FROM barber_blocks
       WHERE barber_id = $1 AND ($3, $4) OVERLAPS (start_time, end_time)`,
      [oldBooking.barber_id, bookingId, newStart, newEnd]
    );

    if (conflict.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: "Nouveau créneau indisponible" });
    }

    await client.query(
      `UPDATE bookings SET start_time = $1, end_time = $2 WHERE id = $3`,
      [newStart, newEnd, bookingId]
    );

    await client.query('COMMIT');
    res.json({ success: true });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating booking:', err.message);
    res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE bookings SET status = 'cancelled'
       WHERE id = $1 AND client_id = $2 AND start_time > NOW() + INTERVAL '24 hours' AND status = 'confirmed'
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) {
      return res.status(400).json({ error: "Impossible d'annuler. Moins de 24h ou résa introuvable" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error cancelling booking:', err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── ADMIN ROUTES ───────────────────────────────────────────────

router.get('/admin/all', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.id, b.start_time, b.end_time, b.status,
              s.name as service_name, s.price,
              c.username as client_name, c.email as client_email,
              u.username as barber_name,
              b.client_id, b.barber_id, b.service_id
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       JOIN users c ON b.client_id = c.id
       JOIN users u ON b.barber_id = u.id
       ORDER BY b.start_time DESC
       LIMIT 500`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching all bookings:', err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch('/admin/:id/cancel', authenticateAdmin, async (req, res) => {
  try {
    await pool.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error cancelling booking:', err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch('/admin/:id/complete', authenticateAdmin, async (req, res) => {
  try {
    await pool.query(`UPDATE bookings SET status = 'completed' WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error completing booking:', err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch('/admin/:id', authenticateAdmin, async (req, res) => {
  const { service_id, barber_id, start_time } = req.body;
  try {
    const serviceRes = await pool.query('SELECT duration FROM services WHERE id = $1', [service_id]);
    if (!serviceRes.rows.length) return res.status(404).json({ error: "Service introuvable" });

    const end_time = new Date(new Date(start_time).getTime() + serviceRes.rows[0].duration * 60000);

    await pool.query(
      `UPDATE bookings SET service_id = $1, barber_id = $2, start_time = $3, end_time = $4 WHERE id = $5`,
      [service_id, barber_id, start_time, end_time, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating booking:', err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;