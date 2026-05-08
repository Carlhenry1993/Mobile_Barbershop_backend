const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const jwt = require('jsonwebtoken');

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

// GET services disponibles
router.get('/services', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, duration, price, description FROM services WHERE active = true ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET barbiers disponibles
router.get('/barbers', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username as name, b.specialties, b.avatar_url
       FROM users u
       JOIN barbers b ON u.id = b.user_id
       WHERE u.role = 'barber' AND b.active = true`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET créneaux disponibles pour une date + barbier + service
router.get('/availability', async (req, res) => {
  const { date, barberId, serviceId } = req.query;
  if (!date ||!barberId ||!serviceId) {
    return res.status(400).json({ error: "date, barberId, serviceId requis" });
  }

  try {
    // 1. Récup durée du service
    const serviceRes = await pool.query('SELECT duration FROM services WHERE id = $1', [serviceId]);
    if (!serviceRes.rows.length) return res.status(404).json({ error: "Service introuvable" });
    const duration = serviceRes.rows[0].duration; // en minutes

    // 2. Récup horaires du barbier pour ce jour
    const dayOfWeek = new Date(date).getDay(); // 0=dimanche
    const scheduleRes = await pool.query(
      'SELECT start_time, end_time FROM barber_schedules WHERE barber_id = $1 AND day_of_week = $2',
      [barberId, dayOfWeek]
    );
    if (!scheduleRes.rows.length) return res.json([]); // Pas dispo ce jour

    const { start_time, end_time } = scheduleRes.rows[0];

    // 3. Récup résas existantes
    const bookingsRes = await pool.query(
      `SELECT start_time, end_time FROM bookings
       WHERE barber_id = $1 AND DATE(start_time) = $2 AND status!= 'cancelled'`,
      [barberId, date]
    );

    // 4. Génère les slots de 30min et filtre ceux qui overlap
    const slots = [];
    const start = new Date(`${date}T${start_time}`);
    const end = new Date(`${date}T${end_time}`);

    for (let slot = new Date(start); slot < end; slot.setMinutes(slot.getMinutes() + 30)) {
      const slotEnd = new Date(slot.getTime() + duration * 60000);
      if (slotEnd > end) break;

      const isBooked = bookingsRes.rows.some(b => {
        const bStart = new Date(b.start_time);
        const bEnd = new Date(b.end_time);
        return (slot < bEnd && slotEnd > bStart); // overlap check
      });

      if (!isBooked && slot > new Date()) { // pas dans le passé
        slots.push(slot.toISOString());
      }
    }

    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST créer une réservation
router.post('/create', authenticate, async (req, res) => {
  const { serviceId, barberId, startTime } = req.body;
  const clientId = req.user.id;

  if (!serviceId ||!barberId ||!startTime) {
    return res.status(400).json({ error: "Champs manquants" });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Vérifie que le slot est toujours libre - lock
    const serviceRes = await client.query('SELECT duration FROM services WHERE id = $1 FOR UPDATE', [serviceId]);
    const duration = serviceRes.rows[0].duration;
    const endTime = new Date(new Date(startTime).getTime() + duration * 60000);

    const conflict = await client.query(
      `SELECT id FROM bookings
       WHERE barber_id = $1 AND status!= 'cancelled'
       AND ($2 < end_time AND $3 > start_time) FOR UPDATE`,
      [barberId, startTime, endTime.toISOString()]
    );

    if (conflict.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: "Ce créneau vient d'être réservé" });
    }

    // 2. Insert la résa
    const result = await client.query(
      `INSERT INTO bookings (client_id, barber_id, service_id, start_time, end_time, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'confirmed', NOW()) RETURNING *`,
      [clientId, barberId, serviceId, startTime, endTime.toISOString()]
    );

    await client.query('COMMIT');

    // 3. TODO: Envoyer email/SMS ici

    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET mes réservations
router.get('/my-bookings', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.id, b.start_time, b.end_time, b.status,
              s.name as service_name, s.price, s.duration,
              u.username as barber_name
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       JOIN users u ON b.barber_id = u.id
       WHERE b.client_id = $1
       ORDER BY b.start_time DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE annuler ma résa
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE bookings SET status = 'cancelled'
       WHERE id = $1 AND client_id = $2 AND start_time > NOW() + INTERVAL '24 hours'
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) {
      return res.status(400).json({ error: "Impossible d'annuler. Moins de 24h ou résa introuvable" });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;