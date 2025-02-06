const express = require("express");
const router = express.Router();
const announcementController = require("../controllers/announcementController");
const isAdmin = require("../middlewares/authMiddleware"); // Importer le middleware isAdmin

// Route pour obtenir toutes les annonces
router.get("/", announcementController.getAllAnnouncements);

// Route pour ajouter une annonce (seulement admin)
router.post("/", isAdmin, announcementController.createAnnouncement);

// Route pour modifier une annonce (seulement admin)
router.put("/:id", isAdmin, announcementController.updateAnnouncement);

// Route pour supprimer une annonce (seulement admin)
router.delete("/:id", isAdmin, announcementController.deleteAnnouncement);

module.exports = router;
