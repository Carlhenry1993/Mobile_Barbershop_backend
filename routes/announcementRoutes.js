// routes/announcementRoutes.js
const express = require("express");
const router = express.Router();
const announcementController = require("../controllers/announcementController");
const isAdmin = require("../middleware/isAdmin");

// Route pour récupérer toutes les annonces (accessible à tous)
router.get("/", announcementController.getAllAnnouncements);

// Route pour créer une annonce (admin uniquement)
router.post("/", isAdmin, announcementController.createAnnouncement);

// Route pour mettre à jour une annonce (admin uniquement)
router.put("/:id", isAdmin, announcementController.updateAnnouncement);

// Route pour supprimer une annonce (admin uniquement)
router.delete("/:id", isAdmin, announcementController.deleteAnnouncement);

module.exports = router;
