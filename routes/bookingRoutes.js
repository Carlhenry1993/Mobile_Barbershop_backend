const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const jwt = require('jsonwebtoken');
const sgMail = require('@sendgrid/mail');

// ─── EMAIL CONFIG ─────────────────────────────────────────────────────────────
sgMail.setApiKey(process.env.SMTP_PASS);

const SHOP_INFO = {
  name:    'Mr. Renaudin Barbershop',
  email:   'mrrenaudinbarber@gmail.com',
  phone:   '(514) 778-8318',
  address: '462 4e Rue de la Pointe',
  city:    'Shawinigan, QC G9N 1G7',
  website: 'https://mrrenaudinbarbershop.com',
};

const FROM_EMAIL = { email: 'mrrenaudinbarber@gmail.com', name: 'Mr. Renaudin Barbershop' };

const ensureReviewTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_reviews (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      client_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      title VARCHAR(140),
      comment TEXT NOT NULL,
      is_approved BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
};

const sendBookingEmail = async (to, subject, html, text) => {
  if (!to) return;
  try {
    await sgMail.send({ to, from: FROM_EMAIL, replyTo: SHOP_INFO.email, subject, text, html });
    console.log('Email sent to:', to);
  } catch (err) {
    console.error('EMAIL FAILED:', err.message);
    if (err.response) console.error('SendGrid errors:', err.response.body.errors);
  }
};

// ─── MIDDLEWARES ──────────────────────────────────────────────────────────────
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Non autorisé' });
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide' });
  }
};

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Non autorisé' });
  try {
    const user = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    if (user.role !== 'admin') return res.status(403).json({ error: 'Accès admin requis' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide' });
  }
};

// ─── CLIENT ROUTES ────────────────────────────────────────────────────────────

// GET /services
router.get('/services', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, duration, price, description FROM services WHERE active = true ORDER BY price'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching services:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /barbers
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
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Horaires officiels Mr. Renaudin Barbershop ───────────────────────────────
// 0=Dim 1=Lun 2=Mar 3=Mer 4=Jeu 5=Ven 6=Sam
const SHOP_HOURS = {
  0: { open: '11:00', close: '17:00' }, // Dimanche
  1: { open: '11:00', close: '19:00' }, // Lundi
  2: { open: '11:00', close: '19:00' }, // Mardi
  3: { open: '11:00', close: '19:00' }, // Mercredi
  4: { open: '11:00', close: '19:00' }, // Jeudi
  5: { open: '11:00', close: '19:00' }, // Vendredi
  6: { open: '12:00', close: '19:00' }, // Samedi
};

const SLOT_INTERVAL_MIN = 30; // intervalle entre créneaux
const TIMEZONE = 'America/Toronto';

/**
 * Retourne le jour de semaine (0-6) d'une date YYYY-MM-DD
 * interprétée dans la timezone du barbershop.
 */
const getDayOfWeekInShopTz = (dateStr) => {
  const ref = new Date(dateStr + 'T12:00:00Z');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
  }).formatToParts(ref);
  const dayName = parts.find(p => p.type === 'weekday').value;
  return { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }[dayName];
};

/**
 * Convertit "YYYY-MM-DD" + "HH:MM" (heure locale du barbershop)
 * en un objet Date UTC.
 */
const shopTimeToUTC = (dateStr, timeStr) => {
  // Créer une date fictive en interprétant l'heure comme locale du shop
  const [h, m] = timeStr.split(':').map(Number);
  // Utiliser le format ISO avec timezone offset obtenu dynamiquement
  // On crée la date naïvement, puis on corrige avec l'offset réel de la TZ
  const naive = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
  
  // Obtenir l'offset réel de America/Toronto pour ce moment
  // en comparant l'heure UTC vs l'heure locale du shop
  const utcHour = naive.getUTCHours();
  const utcMin  = naive.getUTCMinutes();
  const shopStr = naive.toLocaleString('en-US', {
    timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const [sh, sm] = shopStr.replace('24:', '00:').split(':').map(Number);
  
  // Différence entre ce qu'on voulait (h:m) et ce qu'on a (sh:sm) en UTC
  const wantedMinutes = h * 60 + m;
  const gotMinutes    = sh * 60 + sm;
  const diffMs        = (wantedMinutes - gotMinutes) * 60000;
  
  return new Date(naive.getTime() + diffMs);
};

// GET /availability
router.get('/availability', async (req, res) => {
  const { date, barberId, serviceId } = req.query;
  if (!date || !barberId || !serviceId)
    return res.status(400).json({ error: 'date, barberId, serviceId requis' });

  try {
    // 1. Durée du service
    const serviceRes = await pool.query(
      'SELECT duration FROM services WHERE id = $1 AND active = true', [serviceId]
    );
    if (!serviceRes.rows.length)
      return res.status(404).json({ error: 'Service introuvable' });
    const serviceDuration = serviceRes.rows[0].duration;

    // 2. Jour de la semaine dans la timezone du barbershop
    const dayKey = getDayOfWeekInShopTz(date);
    const hours  = SHOP_HOURS[dayKey];
    if (!hours) {
      console.log(`[availability] Aucun horaire pour dayKey=${dayKey}`);
      return res.json([]);
    }

    // 3. Convertir ouverture/fermeture en UTC
    const workOpen  = shopTimeToUTC(date, hours.open);
    const workClose = shopTimeToUTC(date, hours.close);

    console.log(`[availability] date=${date} dayKey=${dayKey} open=${hours.open} close=${hours.close}`);
    console.log(`[availability] workOpen=${workOpen.toISOString()} workClose=${workClose.toISOString()}`);

    // 4. Réservations existantes ce jour-là pour ce barbier
    const bookingsRes = await pool.query(
      `SELECT start_time, end_time FROM bookings
       WHERE barber_id = $1
         AND DATE(start_time AT TIME ZONE $3) = $2::date
         AND status != 'cancelled'
       UNION ALL
       SELECT start_time, end_time FROM barber_blocks
       WHERE barber_id = $1
         AND DATE(start_time AT TIME ZONE $3) = $2::date`,
      [barberId, date, TIMEZONE]
    );

    // 5. Générer les créneaux toutes les 30 minutes
    const slots = [];
    const now   = new Date();
    // Marge de 30 min : on ne propose pas les créneaux dans moins de 30 min
    const minBookableTime = new Date(now.getTime() + 30 * 60000);

    for (
      let slot = new Date(workOpen);
      slot < workClose;
      slot = new Date(slot.getTime() + SLOT_INTERVAL_MIN * 60000)
    ) {
      const slotEnd = new Date(slot.getTime() + serviceDuration * 60000);

      // Le service doit finir avant la fermeture
      if (slotEnd > workClose) break;

      // Uniquement les créneaux futurs (avec marge)
      if (slot < minBookableTime) continue;

      // Vérifier conflit avec réservations existantes
      const isBooked = bookingsRes.rows.some(b => {
        const bStart = new Date(b.start_time);
        const bEnd   = new Date(b.end_time);
        return slot < bEnd && slotEnd > bStart;
      });

      if (!isBooked) slots.push(slot.toISOString());
    }

    console.log(`[availability] ${slots.length} créneaux générés`);
    res.json(slots);

  } catch (err) {
    console.error('Error fetching availability:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /create
router.post('/create', authenticate, async (req, res) => {
  const { serviceId, barberId, startTime } = req.body;
  const clientId = req.user.id;

  if (!serviceId || !barberId || !startTime)
    return res.status(400).json({ error: 'Champs manquants' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const serviceRes = await client.query(
      'SELECT name, duration, price FROM services WHERE id = $1 AND active = true', [serviceId]
    );
    if (!serviceRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Service introuvable' });
    }
    const { name: serviceName, duration, price } = serviceRes.rows[0];
    const start   = new Date(startTime);
    const endTime = new Date(start.getTime() + duration * 60000);

    if (start < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Impossible de réserver dans le passé' });
    }

    // Valider que le créneau respecte les horaires du barbershop
    const bookingDateStr = start.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
    const dayKeyCreate  = getDayOfWeekInShopTz(bookingDateStr);
    const shopHrs       = SHOP_HOURS[dayKeyCreate];
    if (shopHrs) {
      const shopOpen  = shopTimeToUTC(bookingDateStr, shopHrs.open);
      const shopClose = shopTimeToUTC(bookingDateStr, shopHrs.close);
      if (start < shopOpen || endTime > shopClose) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: "Ce créneau est en dehors des heures d'ouverture." });
      }
    }

    const conflict = await client.query(
      `SELECT id FROM bookings
       WHERE barber_id = $1 AND status != 'cancelled'
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
      client.query('SELECT username, email FROM users WHERE id = $1', [barberId]),
    ]);

    const result = await client.query(
      `INSERT INTO bookings (client_id, barber_id, service_id, start_time, end_time, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'confirmed', NOW()) RETURNING *`,
      [clientId, barberId, serviceId, start, endTime]
    );
    await client.query('COMMIT');

    const booking     = result.rows[0];
    const clientEmail = clientRes.rows[0]?.email;
    const clientName  = clientRes.rows[0]?.username;
    const barberEmail = barberRes.rows[0]?.email;
    const barberName  = barberRes.rows[0]?.username;

    const dateStr = start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Toronto' });
    const timeStr = start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' });

    // Email client
    await sendBookingEmail(
      clientEmail,
      `Confirmation de réservation #${booking.id} - ${SHOP_INFO.name}`,
      `<p>Bonjour ${clientName},<br>Votre réservation #${booking.id} est confirmée.<br><b>${serviceName}</b> avec ${barberName}<br>${dateStr} à ${timeStr}<br>${SHOP_INFO.address}, ${SHOP_INFO.city}</p>`,
      `Réservation #${booking.id} confirmée\n${serviceName} avec ${barberName}\n${dateStr} à ${timeStr}`
    );

    // Email barbier
    await sendBookingEmail(
      barberEmail,
      `Nouveau rendez-vous #${booking.id} - ${clientName} ${timeStr}`,
      `<p>Nouveau RDV: <b>${clientName}</b><br>${serviceName}<br>${dateStr} à ${timeStr}</p>`,
      `Nouveau RDV #${booking.id}\nClient: ${clientName}\n${serviceName}\n${dateStr} à ${timeStr}`
    );

    res.json(booking);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Booking ERROR:', err.message);
    res.status(500).json({ error: 'Erreur serveur lors de la réservation' });
  } finally {
    client.release();
  }
});

// GET /my-bookings — ✅ FIX: inclure service_id ET barber_id dans le SELECT
router.get('/my-bookings', authenticate, async (req, res) => {
  try {
    await ensureReviewTable();
    const result = await pool.query(
      `SELECT
          b.id,
          b.start_time,
          b.end_time,
          b.status,
          b.service_id,
          b.barber_id,
          s.name    AS service_name,
          s.price,
          s.duration,
          u.username AS barber_name,
          r.id AS review_id,
          r.rating AS review_rating
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       JOIN users    u ON b.barber_id  = u.id
       LEFT JOIN client_reviews r ON r.booking_id = b.id
       WHERE b.client_id = $1
       ORDER BY b.start_time DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching my bookings:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /:id — Client reporte son propre rendez-vous (> 24h)
router.patch('/:id', authenticate, async (req, res) => {
  const { startTime } = req.body;
  const bookingId     = req.params.id;

  if (!startTime) return res.status(400).json({ error: 'startTime requis' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Vérifier que la résa appartient au client ET est modifiable (> 24h)
    const bookingRes = await client.query(
      `SELECT b.*, s.duration
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       WHERE b.id = $1
         AND b.client_id = $2
         AND b.status = 'confirmed'
         AND b.start_time > NOW() + INTERVAL '24 hours'`,
      [bookingId, req.user.id]
    );

    if (!bookingRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Impossible de modifier. Moins de 24h avant le RDV ou réservation introuvable.',
      });
    }

    const oldBooking = bookingRes.rows[0];
    const newStart   = new Date(startTime);
    const newEnd     = new Date(newStart.getTime() + oldBooking.duration * 60000);

    if (newStart < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Impossible de reporter dans le passé' });
    }

    // Vérifier conflit sur le nouveau créneau
    const conflict = await client.query(
      `SELECT id FROM bookings
       WHERE barber_id = $1 AND status != 'cancelled' AND id != $2
       AND ($3, $4) OVERLAPS (start_time, end_time)
       UNION ALL
       SELECT id FROM barber_blocks
       WHERE barber_id = $1 AND ($3, $4) OVERLAPS (start_time, end_time)`,
      [oldBooking.barber_id, bookingId, newStart, newEnd]
    );

    if (conflict.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ce créneau est déjà pris. Choisissez-en un autre.' });
    }

    await client.query(
      'UPDATE bookings SET start_time = $1, end_time = $2 WHERE id = $3',
      [newStart, newEnd, bookingId]
    );
    await client.query('COMMIT');

    // Envoyer email de confirmation du report
    const clientRes = await pool.query('SELECT username, email FROM users WHERE id = $1', [req.user.id]);
    const barberRes = await pool.query('SELECT username, email FROM users WHERE id = $1', [oldBooking.barber_id]);
    const serviceRes = await pool.query('SELECT name FROM services WHERE id = $1', [oldBooking.service_id]);

    const dateStr = newStart.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Toronto' });
    const timeStr = newStart.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' });
    const clientName  = clientRes.rows[0]?.username;
    const clientEmail = clientRes.rows[0]?.email;
    const barberEmail = barberRes.rows[0]?.email;
    const serviceName = serviceRes.rows[0]?.name;

    await sendBookingEmail(
      clientEmail,
      `Rendez-vous reporté #${bookingId} - ${SHOP_INFO.name}`,
      `<p>Bonjour ${clientName},<br>Votre rendez-vous #${bookingId} a été reporté.<br><b>${serviceName}</b><br>Nouvelle date : ${dateStr} à ${timeStr}</p>`,
      `RDV #${bookingId} reporté\n${serviceName}\nNouvelle date : ${dateStr} à ${timeStr}`
    );

    await sendBookingEmail(
      barberEmail,
      `RDV reporté #${bookingId} - ${clientName}`,
      `<p>Le client ${clientName} a reporté son RDV #${bookingId}.<br><b>${serviceName}</b><br>Nouvelle date : ${dateStr} à ${timeStr}</p>`,
      `RDV #${bookingId} reporté par ${clientName}\n${serviceName}\nNouvelle date : ${dateStr} à ${timeStr}`
    );

    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating booking:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// DELETE /:id — Client annule son propre rendez-vous (> 24h)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE bookings SET status = 'cancelled'
       WHERE id = $1
         AND client_id = $2
         AND start_time > NOW() + INTERVAL '24 hours'
         AND status = 'confirmed'
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!result.rows.length)
      return res.status(400).json({ error: "Impossible d'annuler. Moins de 24h ou réservation introuvable." });
    res.json({ success: true });
  } catch (err) {
    console.error('Error cancelling booking:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────

// GET /admin/all
router.get('/admin/all', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
          b.id,
          b.start_time,
          b.end_time,
          b.status,
          b.service_id,
          b.barber_id,
          b.client_id,
          b.created_at,
          s.name     AS service_name,
          s.price,
          s.duration,
          c.username AS client_name,
          c.email    AS client_email,
          u.username AS barber_name
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       JOIN users    c ON b.client_id  = c.id
       JOIN users    u ON b.barber_id  = u.id
       ORDER BY b.start_time DESC
       LIMIT 500`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching all bookings:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /admin/:id/cancel — Admin annule
router.patch('/admin/:id/cancel', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [req.params.id]
    );

    // Notifier le client par email
    const bookingRes = await client.query(
      `SELECT b.start_time, s.name AS service_name, c.email, c.username
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       JOIN users    c ON b.client_id  = c.id
       WHERE b.id = $1`, [req.params.id]
    );
    await client.query('COMMIT');

    if (bookingRes.rows.length) {
      const { start_time, service_name, email, username } = bookingRes.rows[0];
      const dateStr = new Date(start_time).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const timeStr = new Date(start_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      await sendBookingEmail(
        email,
        `Réservation annulée - ${SHOP_INFO.name}`,
        `<p>Bonjour ${username},<br>Votre rendez-vous du <b>${dateStr} à ${timeStr}</b> (${service_name}) a été annulé par le barbershop.<br>Contactez-nous au ${SHOP_INFO.phone} pour plus d'informations.</p>`,
        `Bonjour ${username},\nVotre RDV du ${dateStr} à ${timeStr} (${service_name}) a été annulé.\nContactez-nous : ${SHOP_INFO.phone}`
      );
    }

    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error cancelling booking:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// PATCH /admin/:id/complete — Admin marque comme terminé
router.patch('/admin/:id/complete', authenticateAdmin, async (req, res) => {
  try {
    await pool.query(`UPDATE bookings SET status = 'completed' WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error completing booking:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /admin/clients — Clients réels (au moins 1 service complété)
router.get('/admin/clients', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
          u.id,
          u.username,
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          u.created_at                              AS member_since,

          COUNT(b.id) FILTER (WHERE b.status = 'completed')              AS total_completed,
          COUNT(b.id) FILTER (WHERE b.status = 'confirmed')              AS upcoming,
          COUNT(b.id) FILTER (WHERE b.status = 'cancelled')              AS total_cancelled,

          SUM(s.price)  FILTER (WHERE b.status = 'completed')            AS total_spent,

          MAX(b.start_time) FILTER (WHERE b.status = 'completed')        AS last_visit,
          MIN(b.start_time) FILTER (WHERE b.status = 'completed')        AS first_visit,

          -- Service le plus fréquent
          MODE() WITHIN GROUP (ORDER BY s.name)
            FILTER (WHERE b.status = 'completed')                        AS favourite_service

       FROM users u
       JOIN bookings b ON b.client_id = u.id
       JOIN services s ON s.id = b.service_id
       WHERE u.role = 'client'
       GROUP BY u.id, u.username, u.first_name, u.last_name, u.email, u.phone, u.created_at
       HAVING COUNT(b.id) FILTER (WHERE b.status = 'completed') >= 1
       ORDER BY last_visit DESC NULLS LAST`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching clients:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
