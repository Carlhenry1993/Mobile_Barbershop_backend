const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'Accès non autorisé. Veuillez vous connecter.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token invalide.' });
    }
    req.user = user; // Ajouter les informations de l'utilisateur à la requête
    next(); // Passer au middleware suivant
  });
};

module.exports = { authenticateToken };
