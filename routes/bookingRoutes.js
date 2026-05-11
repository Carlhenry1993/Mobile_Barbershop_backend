const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const jwt = require('jsonwebtoken');
const sgMail = require('@sendgrid/mail');

// ─── EMAIL CONFIG SENDGRID API ───────────────────────────────────────────────
console.log('--- SENDGRID API INIT ---');
console.log('API KEY set:',!!process.env.SMTP_PASS);

sgMail.setApiKey(process.env.SMTP_PASS);

const FROM_EMAIL = {
  email: 'mrrenaudinbarber@gmail.com', // Change après Domain Auth
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
    replyTo: 'mrrenaudinbarber@gmail.com',
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

    // EMAIL CLIENT - PROFESSIONNEL
    const clientSubject = `Confirmation de réservation - ${dateStr}`;
    const clientText = `
Bonjour ${clientName},

Votre rendez-vous chez Mr. Renaudin Barbershop est confirmé.

DÉTAILS DE LA RÉSERVATION
Numéro de réservation : #${bookingId}
Service : ${serviceName}
Barbier : ${barberName}
Date : ${dateStr}
Heure : ${timeStr}
Durée : ${duration} minutes
Prix : ${price}$ CAD

ADRESSE
Mr. Renaudin Barbershop
462 4e Rue de la Pointe
Shawinigan, QC G9N 1G7

POLITIQUE D'ANNULATION
Annulation gratuite jusqu'à 24 heures avant le rendez-vous.
Pour annuler ou modifier : https://mrrenaudinbarbershop.com/compte

Merci de votre confiance.
L'équipe Mr. Renaudin Barbershop
`;

    const clientHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e0e0e0;">
          <tr>
            <td style="background-color:#0e1015;padding:40px 40px 30px;text-align:center;">
              <h1 style="margin:0;color:#d4a843;font-family:Georgia,serif;font-size:28px;font-weight:900;letter-spacing:1px;">
                MR. RENAUDIN
              </h1>
              <p style="margin:10px 0 0;color:#b8c8da;font-size:11px;letter-spacing:3px;text-transform:uppercase;">
                Barbershop
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 20px;color:#0e1015;font-size:22px;font-weight:600;">
                Réservation confirmée
              </h2>
              <p style="margin:0 0 30px;color:#333;font-size:15px;line-height:1.6;">
                Bonjour ${clientName},<br><br>
                Votre rendez-vous chez Mr. Renaudin Barbershop est confirmé. Nous avons hâte de vous recevoir.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e0e0;margin-bottom:30px;">
                <tr>
                  <td style="background-color:#f8f9fa;padding:15px 20px;border-bottom:1px solid #e0e0e0;">
                    <p style="margin:0;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:1px;">
                      Numéro de réservation
                    </p>
                    <p style="margin:5px 0 0;color:#0e1015;font-size:16px;font-weight:600;">
                      #${bookingId}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="8" cellspacing="0">
                      <tr>
                        <td style="color:#666;font-size:13px;width:120px;">Service</td>
                        <td style="color:#0e1015;font-size:15px;font-weight:600;">${serviceName}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;">Barbier</td>
                        <td style="color:#0e1015;font-size:15px;">${barberName}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;">Date</td>
                        <td style="color:#0e1015;font-size:15px;">${dateStr}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;">Heure</td>
                        <td style="color:#0e1015;font-size:15px;font-weight:600;">${timeStr}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;">Durée</td>
                        <td style="color:#0e1015;font-size:15px;">${duration} minutes</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;">Prix</td>
                        <td style="color:#0e1015;font-size:15px;font-weight:600;">${price}$ CAD</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fa;border-left:3px solid #d4a843;margin-bottom:30px;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 8px;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:1px;">
                      Adresse
                    </p>
                    <p style="margin:0;color:#0e1015;font-size:14px;line-height:1.6;">
                      <strong>Mr. Renaudin Barbershop</strong><br>
                      462 4e Rue de la Pointe<br>
                      Shawinigan, QC G9N 1G7
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:30px;">
                <tr>
                  <td style="padding:15px;background-color:#fff8e1;border:1px solid #d4a843;">
                    <p style="margin:0;color:#0e1015;font-size:13px;line-height:1.6;">
                      <strong>Politique d'annulation :</strong> Annulation gratuite jusqu'à 24 heures avant le rendez-vous.
                      Passé ce délai, des frais peuvent s'appliquer.
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://mrrenaudinbarbershop.com/compte" style="display:inline-block;background-color:#d4a843;color:#0e1015;text-decoration:none;padding:14px 32px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">
                      Gérer ma réservation
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa;padding:30px 40px;border-top:1px solid #e0e0e0;text-align:center;">
              <p style="margin:0 0 10px;color:#666;font-size:12px;line-height:1.6;">
                Merci de votre confiance<br>
                <strong style="color:#0e1015;">L'équipe Mr. Renaudin Barbershop</strong>
              </p>
              <p style="margin:15px 0 0;color:#999;font-size:11px;">
                Cet email a été envoyé à ${clientEmail}
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

    // EMAIL BARBIER - PROFESSIONNEL
    const barberSubject = `Nouvelle réservation - ${clientName} - ${timeStr}`;
    const barberText = `
Nouvelle réservation reçue

CLIENT
Nom : ${clientName}
Email : ${clientEmail}

DÉTAILS DU RENDEZ-VOUS
Numéro : #${bookingId}
Service : ${serviceName}
Date : ${dateStr}
Heure : ${timeStr}
Durée : ${duration} minutes
Prix : ${price}$ CAD

Le client a reçu une confirmation automatique.
`;

    const barberHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e0e0e0;">
          <tr>
            <td style="background-color:#0e1015;padding:30px 40px;text-align:center;">
              <h1 style="margin:0;color:#d4a843;font-family:Georgia,serif;font-size:24px;font-weight:900;">
                NOUVELLE RÉSERVATION
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e0e0;margin-bottom:25px;">
                <tr>
                  <td style="background-color:#f8f9fa;padding:15px 20px;border-bottom:1px solid #e0e0e0;">
                    <p style="margin:0;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:1px;">
                      Client
                    </p>
                    <p style="margin:5px 0 0;color:#0e1015;font-size:18px;font-weight:600;">
                      ${clientName}
                    </p>
                    <p style="margin:5px 0 0;color:#666;font-size:13px;">
                      ${clientEmail}
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e0e0;">
                <tr>
                  <td style="background-color:#0e1015;padding:15px 20px;">
                    <p style="margin:0;color:#d4a843;font-size:11px;text-transform:uppercase;letter-spacing:1px;">
                      Détails du rendez-vous
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="8" cellspacing="0">
                      <tr>
                        <td style="color:#666;font-size:13px;width:140px;">Numéro</td>
                        <td style="color:#0e1015;font-size:15px;font-weight:600;">#${bookingId}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;">Service</td>
                        <td style="color:#0e1015;font-size:15px;font-weight:600;">${serviceName}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;">Date</td>
                        <td style="color:#0e1015;font-size:15px;">${dateStr}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;">Heure</td>
                        <td style="color:#0e1015;font-size:15px;font-weight:600;">${timeStr}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;">Durée</td>
                        <td style="color:#0e1015;font-size:15px;">${duration} minutes</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;">Prix</td>
                        <td style="color:#0e1015;font-size:15px;font-weight:600;">${price}$ CAD</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:25px 0 0;color:#666;font-size:13px;text-align:center;">
                Le client a reçu une confirmation automatique avec tous les détails.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #e0e0e0;">
              <p style="margin:0;color:#999;font-size:11px;">
                Mr. Renaudin Barbershop - Système de réservation
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