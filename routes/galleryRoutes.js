const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

const router = express.Router();

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Non autorise" });
  try {
    const user = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    if (user.role !== "admin") return res.status(403).json({ error: "Acces admin requis" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Token invalide" });
  }
};

const isAdminRequest = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    return jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET).role === "admin";
  } catch {
    return false;
  }
};

const ensureGalleryTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gallery_photos (
      id SERIAL PRIMARY KEY,
      title VARCHAR(140) NOT NULL,
      description TEXT,
      category VARCHAR(60) DEFAULT 'coupe',
      image_data TEXT NOT NULL,
      is_featured BOOLEAN DEFAULT false,
      is_published BOOLEAN DEFAULT true,
      show_in_gallery BOOLEAN DEFAULT true,
      show_on_home BOOLEAN DEFAULT true,
      show_on_services BOOLEAN DEFAULT false,
      display_order INTEGER DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query("ALTER TABLE gallery_photos ADD COLUMN IF NOT EXISTS show_in_gallery BOOLEAN DEFAULT true");
  await pool.query("ALTER TABLE gallery_photos ADD COLUMN IF NOT EXISTS show_on_home BOOLEAN DEFAULT true");
  await pool.query("ALTER TABLE gallery_photos ADD COLUMN IF NOT EXISTS show_on_services BOOLEAN DEFAULT false");
};

const sanitizePhoto = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  category: row.category,
  image_data: row.image_data,
  is_featured: row.is_featured,
  is_published: row.is_published,
  show_in_gallery: row.show_in_gallery,
  show_on_home: row.show_on_home,
  show_on_services: row.show_on_services,
  display_order: row.display_order,
  created_at: row.created_at,
});

const validateImageData = (imageData) => {
  if (typeof imageData !== "string") return false;
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageData)) return false;
  return Buffer.byteLength(imageData, "utf8") <= 6 * 1024 * 1024;
};

router.get("/", async (req, res) => {
  try {
    await ensureGalleryTable();
    const includeHidden = req.query.includeHidden === "true" && isAdminRequest(req);
    const placement = ["gallery", "home", "services"].includes(req.query.placement)
      ? req.query.placement
      : null;
    const placementClause = placement === "gallery"
      ? "AND show_in_gallery = true"
      : placement === "home"
        ? "AND show_on_home = true"
        : placement === "services"
          ? "AND show_on_services = true"
          : "";
    const result = await pool.query(
      `SELECT *
       FROM gallery_photos
       WHERE ($1::boolean = true OR is_published = true)
       ${includeHidden ? "" : placementClause}
       ORDER BY is_featured DESC, display_order ASC, created_at DESC`,
      [includeHidden]
    );
    res.json(result.rows.map(sanitizePhoto));
  } catch (err) {
    console.error("Error fetching gallery:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/", authenticateAdmin, async (req, res) => {
  const {
    title,
    description = "",
    category = "coupe",
    imageData,
    isFeatured = false,
    isPublished = true,
    showInGallery = true,
    showOnHome = true,
    showOnServices = false,
    displayOrder = 0,
  } = req.body;

  if (!title?.trim()) return res.status(400).json({ error: "Titre requis" });
  if (!validateImageData(imageData)) {
    return res.status(400).json({ error: "Image invalide ou trop lourde. Utilisez JPG, PNG ou WebP sous 6 MB." });
  }

  try {
    await ensureGalleryTable();
    if (isFeatured) {
      await pool.query("UPDATE gallery_photos SET is_featured = false");
    }
    const result = await pool.query(
      `INSERT INTO gallery_photos
       (title, description, category, image_data, is_featured, is_published, show_in_gallery, show_on_home, show_on_services, display_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        title.trim(),
        description.trim(),
        category.trim() || "coupe",
        imageData,
        Boolean(isFeatured),
        Boolean(isPublished),
        Boolean(showInGallery),
        Boolean(showOnHome || isFeatured),
        Boolean(showOnServices),
        Number(displayOrder) || 0,
        req.user.id,
      ]
    );
    res.status(201).json(sanitizePhoto(result.rows[0]));
  } catch (err) {
    console.error("Error creating gallery photo:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch("/:id", authenticateAdmin, async (req, res) => {
  const {
    title,
    description,
    category,
    imageData,
    isFeatured,
    isPublished,
    showInGallery,
    showOnHome,
    showOnServices,
    displayOrder,
  } = req.body;

  if (imageData && !validateImageData(imageData)) {
    return res.status(400).json({ error: "Image invalide ou trop lourde." });
  }

  try {
    await ensureGalleryTable();
    if (isFeatured === true) {
      await pool.query("UPDATE gallery_photos SET is_featured = false WHERE id != $1", [req.params.id]);
    }
    const result = await pool.query(
      `UPDATE gallery_photos SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        category = COALESCE($3, category),
        image_data = COALESCE($4, image_data),
        is_featured = CASE
          WHEN $6 = false OR $8 = false THEN false
          ELSE COALESCE($5, is_featured)
        END,
        is_published = COALESCE($6, is_published),
        show_in_gallery = COALESCE($7, show_in_gallery),
        show_on_home = COALESCE($8, show_on_home),
        show_on_services = COALESCE($9, show_on_services),
        display_order = COALESCE($10, display_order),
        updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        title?.trim(),
        description?.trim(),
        category?.trim(),
        imageData,
        typeof isFeatured === "boolean" ? isFeatured : null,
        typeof isPublished === "boolean" ? isPublished : isFeatured === true ? true : null,
        typeof showInGallery === "boolean" ? showInGallery : null,
        typeof showOnHome === "boolean" ? showOnHome : isFeatured === true ? true : null,
        typeof showOnServices === "boolean" ? showOnServices : null,
        Number.isFinite(Number(displayOrder)) ? Number(displayOrder) : null,
        req.params.id,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Photo introuvable" });
    res.json(sanitizePhoto(result.rows[0]));
  } catch (err) {
    console.error("Error updating gallery photo:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/:id", authenticateAdmin, async (req, res) => {
  try {
    await ensureGalleryTable();
    await pool.query("DELETE FROM gallery_photos WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting gallery photo:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
