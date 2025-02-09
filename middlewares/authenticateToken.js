// middleware/authenticateToken.js
const jwt = require("jsonwebtoken");

const authenticateToken = (req, res, next) => {
  // Extract the token from the Authorization header
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return res
      .status(401)
      .json({ message: "Accès non autorisé. Veuillez vous connecter." });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Token invalide." });
    }
    req.user = user;
    next();
  });
};

module.exports = { authenticateToken };
