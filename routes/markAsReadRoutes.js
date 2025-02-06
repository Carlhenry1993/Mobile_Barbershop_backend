const express = require("express");
const router = express.Router();
const pool = require("../db/pool");

router.put("/messages/markAsRead", async (req, res) => {
  const { userId } = req.body; // ID de l'utilisateur (client ou admin)

  try {
    const result = await pool.query(
      "UPDATE messages SET read = true WHERE recipient = $1 AND read = false",
      [userId]
    );

    res.status(200).json({
      message: "Messages marked as read.",
      updatedRows: result.rowCount,
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour des messages :", error);
    res.status(500).json({ error: "Failed to mark messages as read." });
  }
});

module.exports = router;
