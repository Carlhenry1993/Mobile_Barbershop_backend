// middleware/isAdmin.js
const jwt = require("jsonwebtoken");

const isAdmin = (req, res, next) => {
  // Retrieve token from the Authorization header (Bearer token)
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(403).json({ message: "Accès interdit" });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Accès réservé aux administrateurs" });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Token invalide ou expiré" });
  }
};

module.exports = isAdmin;
