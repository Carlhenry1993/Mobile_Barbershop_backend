const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

const router = express.Router();

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Non autorise" });
  try {
    req.user = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token invalide" });
  }
};

const authenticateAdmin = (req, res, next) => {
  authenticate(req, res, () => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Acces admin requis" });
    next();
  });
};

const isAdminRequest = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    return jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET).role === "admin";
  } catch {
    return false;
  }
};

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

const serializeReview = (row) => ({
  id: row.id,
  booking_id: row.booking_id,
  client_id: row.client_id,
  client_name: row.client_name,
  service_name: row.service_name,
  barber_name: row.barber_name,
  rating: row.rating,
  title: row.title,
  comment: row.comment,
  is_approved: row.is_approved,
  created_at: row.created_at,
});

router.get("/", async (req, res) => {
  try {
    await ensureReviewTable();
    const includeHidden = req.query.includeHidden === "true" && isAdminRequest(req);
    const result = await pool.query(
      `SELECT r.*, u.username AS client_name, s.name AS service_name, bu.username AS barber_name
       FROM client_reviews r
       LEFT JOIN users u ON u.id = r.client_id
       LEFT JOIN bookings b ON b.id = r.booking_id
       LEFT JOIN services s ON s.id = b.service_id
       LEFT JOIN users bu ON bu.id = b.barber_id
       WHERE ($1::boolean = true OR r.is_approved = true)
       ORDER BY r.created_at DESC`,
      [includeHidden]
    );
    res.json(result.rows.map(serializeReview));
  } catch (err) {
    console.error("Error fetching reviews:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/", authenticate, async (req, res) => {
  const { bookingId, rating, title = "", comment } = req.body;
  const parsedRating = Number(rating);

  if (!bookingId || !Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return res.status(400).json({ error: "Reservation et note de 1 a 5 requises" });
  }
  if (!comment?.trim() || comment.trim().length < 8) {
    return res.status(400).json({ error: "Votre avis doit contenir au moins 8 caracteres." });
  }

  try {
    await ensureReviewTable();
    const booking = await pool.query(
      `SELECT id FROM bookings
       WHERE id = $1 AND client_id = $2 AND status = 'completed'`,
      [bookingId, req.user.id]
    );
    if (!booking.rows.length) {
      return res.status(403).json({ error: "Avis disponible seulement apres une coupe terminee." });
    }

    const result = await pool.query(
      `INSERT INTO client_reviews (booking_id, client_id, rating, title, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (booking_id) DO UPDATE SET
         rating = EXCLUDED.rating,
         title = EXCLUDED.title,
         comment = EXCLUDED.comment,
         updated_at = NOW()
       RETURNING *`,
      [bookingId, req.user.id, parsedRating, title.trim(), comment.trim()]
    );
    res.status(201).json(serializeReview(result.rows[0]));
  } catch (err) {
    console.error("Error creating review:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch("/:id", authenticateAdmin, async (req, res) => {
  try {
    await ensureReviewTable();
    const result = await pool.query(
      `UPDATE client_reviews
       SET is_approved = COALESCE($1, is_approved), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [typeof req.body.isApproved === "boolean" ? req.body.isApproved : null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Avis introuvable" });
    res.json(serializeReview(result.rows[0]));
  } catch (err) {
    console.error("Error updating review:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/:id", authenticateAdmin, async (req, res) => {
  try {
    await ensureReviewTable();
    await pool.query("DELETE FROM client_reviews WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting review:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
