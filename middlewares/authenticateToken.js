const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  // Extract the token from the Authorization header
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    // If no token is provided, respond with 401 Unauthorized
    return res.status(401).json({ message: 'Accès non autorisé. Veuillez vous connecter.' });
  }

  // Verify the token using the secret key from environment variables
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      // If token verification fails, respond with 403 Forbidden
      return res.status(403).json({ message: 'Token invalide.' });
    }
    // Attach user data to the request object
    req.user = user;
    // Proceed to the next middleware or route handler
    next();
  });
};

module.exports = { authenticateToken };
