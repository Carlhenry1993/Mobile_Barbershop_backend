const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

router.post('/register', async (req, res) => {
  const { username, email, password, firstName, lastName, phone, smsOptIn } = req.body;

  console.log('Register attempt:', { username, email, firstName, lastName });

  if (!username ||!email ||!password ||!firstName ||!lastName) {
    return res.status(400).json({ error: "Champs obligatoires manquants" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Mot de passe 6 caractères minimum" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Email invalide" });
  }

  try {
    const exists = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: "Nom d'utilisateur ou email déjà utilisé" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, email, password, first_name, last_name, phone, sms_opt_in, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'client', NOW())
       RETURNING id, username, email, first_name, last_name, role`,
      [username, email, hashedPassword, firstName, lastName, phone || null, smsOptIn!== false]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      }
    });

  } catch (err) {
    console.error('Register ERROR:', err.message);
    console.error('Register STACK:', err.stack);
    res.status(500).json({ error: "Erreur serveur lors de l'inscription" });
  }
});

router.post('/login', async (req, res) => {
  const { login, password } = req.body;

  if (!login ||!password) {
    return res.status(400).json({ error: "Champs manquants" });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
      [login]
    );
    if (!result.rows.length) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      }
    });

  } catch (err) {
    console.error('Login ERROR:', err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;