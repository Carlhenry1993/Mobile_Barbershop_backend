const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const pool = require('../db/pool');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  connectionTimeout: 5000, // 5s max
  greetingTimeout: 5000,
  socketTimeout: 10000
});

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorise' });
  }
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide' });
  }
};

const sendWelcomeEmail = (to, firstName, username) => {
  // PAS DE AWAIT - fire and forget
  transporter.sendMail({
    from: `"Mr. Renaudin Barbershop" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Bienvenue chez Mr. Renaudin Barbershop',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d4a843;">Bienvenue ${firstName}!</h2>
        <p>Votre compte a été créé avec succès.</p>
        <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-left: 4px solid #d4a843;">
          <p style="margin: 5px 0;"><b>Nom d'utilisateur :</b> ${username}</p>
          <p style="margin: 5px 0;"><b>Email :</b> ${to}</p>
        </div>
        <a href="https://mrrenaudinbarbershop.com/reserver"
           style="display: inline-block; background: #d4a843; color: #000; padding: 12px 24px; text-decoration: none; font-weight: bold; margin: 20px 0;">
          Réserver mon premier RDV
        </a>
      </div>
    `
  }).then(() => console.log('Welcome email sent to:', to))
   .catch(err => console.error('Email error:', err.message));
};

router.post('/register', async (req, res) => {
  const { username, email, password, firstName, lastName, phone, smsOptIn } = req.body;

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

    // EMAIL EN BACKGROUND - NE BLOQUE PAS LA REPONSE
    sendWelcomeEmail(user.email, user.first_name, user.username);

    // REPONSE IMMEDIATE
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

router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, first_name, last_name, phone, sms_opt_in, role, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Utilisateur introuvable" });
    const user = result.rows[0];
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      smsOptIn: user.sms_opt_in,
      role: user.role,
      createdAt: user.created_at,
    });
  } catch (err) {
    console.error('Me ERROR:', err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch('/me', authenticate, async (req, res) => {
  const { firstName, lastName, phone, smsOptIn } = req.body;
  if (!firstName?.trim() || !lastName?.trim()) {
    return res.status(400).json({ error: "Prenom et nom requis" });
  }
  try {
    const result = await pool.query(
      `UPDATE users
       SET first_name = $1, last_name = $2, phone = $3, sms_opt_in = $4
       WHERE id = $5
       RETURNING id, username, email, first_name, last_name, phone, sms_opt_in, role, created_at`,
      [firstName.trim(), lastName.trim(), phone?.trim() || null, smsOptIn !== false, req.user.id]
    );
    const user = result.rows[0];
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      smsOptIn: user.sms_opt_in,
      role: user.role,
      createdAt: user.created_at,
    });
  } catch (err) {
    console.error('Update profile ERROR:', err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
