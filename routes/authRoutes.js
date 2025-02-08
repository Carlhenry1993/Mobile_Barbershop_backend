const express = require('express');
const { body } = require('express-validator');
const { login, register } = require('../controllers/authController');

const router = express.Router();

// Route d'inscription
router.post(
  '/register',
  [
    body('username').notEmpty().withMessage('Le nom d’utilisateur est requis.'),
    body('password').isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères.'),
  ],
  register // Contrôleur pour gérer l'inscription
);

// Route de connexion
router.post(
  '/login',
  [
    body('username').notEmpty().withMessage('Le nom d’utilisateur est requis.'),
    body('password').notEmpty().withMessage('Le mot de passe est requis.'),
  ],
  login // Contrôleur pour gérer la connexion
);

module.exports = router;
