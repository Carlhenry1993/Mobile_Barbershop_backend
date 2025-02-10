// controllers/announcementController.js
const pool = require("../db/pool");

// Récupérer toutes les annonces
exports.getAllAnnouncements = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM announcements ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("Erreur lors de la récupération des annonces:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// Créer une nouvelle annonce (admin uniquement)
exports.createAnnouncement = async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ message: "Titre et contenu sont requis" });
  }
  try {
    const result = await pool.query(
      "INSERT INTO announcements (title, content, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING *",
      [title, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Erreur lors de la création de l'annonce:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// Mettre à jour une annonce (admin uniquement)
exports.updateAnnouncement = async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ message: "Titre et contenu sont requis" });
  }
  try {
    const result = await pool.query(
      "UPDATE announcements SET title = $1, content = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *",
      [title, content, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Annonce non trouvée" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erreur lors de la mise à jour de l'annonce:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// Supprimer une annonce (admin uniquement)
exports.deleteAnnouncement = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM announcements WHERE id = $1 RETURNING *", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Annonce non trouvée" });
    }
    res.status(204).send();
  } catch (err) {
    console.error("Erreur lors de la suppression de l'annonce:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};
