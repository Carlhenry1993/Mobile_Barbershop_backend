const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// ─── EMAIL CONFIG ───────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP ERROR:', error.message);
  } else {
    console.log('SMTP Server ready');
  }
});

const sendBookingEmail = (to, subject, html) => {
  if (!to) {
    console.log('Email skip: no recipient');
    return;
  }

  console.log('Sending email to:', to);

  transporter.sendMail({
    from: `"Mr. Renaudin Barbershop" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html
  }).then(info => {
    console.log('Email sent:', info.messageId, 'to:', to);
  }).catch(err => {
    console.error('EMAIL FAILED:', err.message);
    console.error('Code:', err.code);
  });
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

    const dateStr = start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Toronto' });
    const timeStr = start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' });

    sendBookingEmail(
      clientEmail,
      'Confirmation de réservation - Mr. Renaudin',
      `<h2>Réservation confirmée</h2>
       <p>Bonjour ${clientName},</p>
       <p>Votre RDV est confirmé :</p>
       <ul>
         <li><b>Service :</b> ${serviceName}</li>
         <li><b>Barbier :</b> ${barberName}</li>
         <li><b>Date :</b> ${dateStr} à ${timeStr}</li>
         <li><b>Durée :</b> ${duration} min</li>
         <li><b>Prix :</b> ${price}$</li>
         <li><b>Adresse :</b> 462 4e Rue de la Pointe, Shawinigan, QC G9N 1G7</li>
       </ul>
       <p>Annulation gratuite jusqu'à 24h avant. <a href="https://mrrenaudinbarbershop.com/compte">Gérer ma réservation</a></p>`
    );

    sendBookingEmail(
      barberEmail,
      `Nouvelle réservation - ${clientName}`,
      `<h2>Nouvelle réservation</h2>
       <p><b>Client :</b> ${clientName} (${clientEmail})</p>
       <p><b>Service :</b> ${serviceName}</p>
       <p><b>Date :</b> ${dateStr} à ${timeStr}</p>
       <p><b>Durée :</b> ${duration} min</p>`
    );

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