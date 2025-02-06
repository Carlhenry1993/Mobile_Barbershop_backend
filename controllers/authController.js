const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const pool = require('../db/pool'); // Assurez-vous que la configuration PostgreSQL est correcte

// Fonction d'inscription
const register = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { username, password, role } = req.body;

    try {
        // Vérifier si l'utilisateur existe déjà
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length > 0) {
            return res.status(400).json({ message: 'Nom d’utilisateur déjà pris.' });
        }

        // Empêcher la création d'un compte administrateur
        if (role && role.toLowerCase() === 'admin') {
            return res.status(403).json({ message: "Vous n'avez pas le droit de créer un compte administrateur." });
        }

        // Si aucun rôle n'est spécifié, attribuer "client" par défaut
        const userRole = role?.toLowerCase() || 'client';

        // Hashage du mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insérer l'utilisateur dans la base de données
        const newUser = await pool.query(
            'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role',
            [username, hashedPassword, userRole]
        );

        // Créer un token JWT
        const token = jwt.sign(
            { id: newUser.rows[0].id, role: userRole },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        return res.status(201).json({
            message: 'Utilisateur créé avec succès.',
            token,
            user: { id: newUser.rows[0].id, username: newUser.rows[0].username, role: userRole }
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Erreur serveur.');
    }
};

// Fonction de connexion
const login = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    try {
        // Vérifier si l'utilisateur existe
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Utilisateur non trouvé.' });
        }

        const user = result.rows[0];

        // Comparer les mots de passe
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Mot de passe incorrect.' });
        }

        // Créer un token JWT
        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        return res.json({
            message: 'Connexion réussie.',
            token,
            user: { id: user.id, username: user.username, role: user.role }
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Erreur serveur.');
    }
};

module.exports = { login, register };
