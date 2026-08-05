const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

const router = express.Router();

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Non autorise" });
  }

  try {
    const user = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    if (user.role !== "admin") {
      return res.status(403).json({ error: "Acces admin requis" });
    }
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

const ensureProductsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      slug VARCHAR(180) UNIQUE,
      brand VARCHAR(120),
      category VARCHAR(80) DEFAULT 'soin',
      subcategory VARCHAR(120),
      short_description VARCHAR(240),
      description TEXT,
      price NUMERIC(10,2),
      stock_quantity INTEGER DEFAULT 0,
      image_data TEXT,
      is_featured BOOLEAN DEFAULT false,
      is_published BOOLEAN DEFAULT true,
      display_order INTEGER DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query("ALTER TABLE products ENABLE ROW LEVEL SECURITY");
  await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS slug VARCHAR(180) UNIQUE");
  await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(120)");
  await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(80) DEFAULT 'soin'");
  await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory VARCHAR(120)");
  await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS short_description VARCHAR(240)");
  await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT");
  await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(10,2)");
  await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0");
  await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS image_data TEXT");
  await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false");
  await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true");
  await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0");
  await pool.query("CREATE INDEX IF NOT EXISTS products_category_subcategory_idx ON products(category, subcategory)");
};

const slugify = (value) => {
  const base = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);

  return base || `produit-${Date.now()}`;
};

const parseOptionalPrice = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : NaN;
};

const parseStockQuantity = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity >= 0 ? quantity : NaN;
};

const validateImageData = (imageData) => {
  if (!imageData) return true;
  if (typeof imageData !== "string") return false;
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageData)) return false;
  return Buffer.byteLength(imageData, "utf8") <= 6 * 1024 * 1024;
};

const serializeProduct = (row) => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  brand: row.brand,
  category: row.category,
  subcategory: row.subcategory,
  short_description: row.short_description,
  description: row.description,
  price: row.price,
  stock_quantity: row.stock_quantity,
  image_data: row.image_data,
  is_featured: row.is_featured,
  is_published: row.is_published,
  display_order: row.display_order,
  created_at: row.created_at,
});

router.get("/", async (req, res) => {
  try {
    await ensureProductsTable();
    const includeHidden = req.query.includeHidden === "true" && isAdminRequest(req);
    const category = req.query.category?.trim();
    const subcategory = req.query.subcategory?.trim();

    const params = [includeHidden];
    let categoryClause = "";
    if (category) {
      params.push(category);
      categoryClause = `AND category = $${params.length}`;
    }
    let subcategoryClause = "";
    if (subcategory) {
      params.push(subcategory);
      subcategoryClause = `AND subcategory = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT *
       FROM products
       WHERE ($1::boolean = true OR is_published = true)
       ${categoryClause}
       ${subcategoryClause}
       ORDER BY is_featured DESC, display_order ASC, created_at DESC`,
      params
    );

    res.json(result.rows.map(serializeProduct));
  } catch (err) {
    console.error("Error fetching products:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/", authenticateAdmin, async (req, res) => {
  const {
    name,
    slug,
    brand = "",
    category = "soin",
    subcategory = "",
    shortDescription = "",
    description = "",
    price,
    stockQuantity = 0,
    imageData = "",
    isFeatured = false,
    isPublished = true,
    displayOrder = 0,
  } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: "Nom du produit requis" });
  }

  if (!validateImageData(imageData)) {
    return res.status(400).json({ error: "Image invalide ou trop lourde. Utilisez JPG, PNG ou WebP sous 6 MB." });
  }

  const parsedPrice = parseOptionalPrice(price);
  const parsedStock = stockQuantity === undefined ? null : parseStockQuantity(stockQuantity);
  if (Number.isNaN(parsedPrice)) return res.status(400).json({ error: "Prix invalide" });
  if (Number.isNaN(parsedStock)) return res.status(400).json({ error: "Stock invalide" });

  try {
    await ensureProductsTable();
    const result = await pool.query(
      `INSERT INTO products
       (name, slug, brand, category, subcategory, short_description, description, price, stock_quantity, image_data, is_featured, is_published, display_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        name.trim(),
        slugify(slug || name),
        brand.trim(),
        category.trim() || "soin",
        subcategory?.trim() || null,
        shortDescription.trim(),
        description.trim(),
        parsedPrice,
        parsedStock,
        imageData,
        Boolean(isFeatured),
        Boolean(isPublished),
        Number(displayOrder) || 0,
        req.user.id,
      ]
    );

    res.status(201).json(serializeProduct(result.rows[0]));
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Un produit avec ce nom existe deja. Ajustez le nom ou le slug." });
    }
    console.error("Error creating product:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch("/:id", authenticateAdmin, async (req, res) => {
  const {
    name,
    slug,
    brand,
    category,
    subcategory,
    shortDescription,
    description,
    price,
    stockQuantity,
    imageData,
    isFeatured,
    isPublished,
    displayOrder,
  } = req.body;

  if (name !== undefined && !name?.trim()) {
    return res.status(400).json({ error: "Nom du produit requis" });
  }

  if (imageData && !validateImageData(imageData)) {
    return res.status(400).json({ error: "Image invalide ou trop lourde." });
  }

  const parsedPrice = parseOptionalPrice(price);
  const parsedStock = stockQuantity === undefined ? null : parseStockQuantity(stockQuantity);
  if (Number.isNaN(parsedPrice)) return res.status(400).json({ error: "Prix invalide" });
  if (Number.isNaN(parsedStock)) return res.status(400).json({ error: "Stock invalide" });

  try {
    await ensureProductsTable();
    const hasSubcategoryPatch = Object.prototype.hasOwnProperty.call(req.body, "subcategory")
      || Object.prototype.hasOwnProperty.call(req.body, "category");
    const result = await pool.query(
      `UPDATE products SET
        name = COALESCE($1, name),
        slug = COALESCE($2, slug),
        brand = COALESCE($3, brand),
        category = COALESCE($4, category),
        subcategory = CASE WHEN $5::boolean THEN $6 ELSE subcategory END,
        short_description = COALESCE($7, short_description),
        description = COALESCE($8, description),
        price = COALESCE($9, price),
        stock_quantity = COALESCE($10, stock_quantity),
        image_data = COALESCE($11, image_data),
        is_featured = COALESCE($12, is_featured),
        is_published = COALESCE($13, is_published),
        display_order = COALESCE($14, display_order),
        updated_at = NOW()
       WHERE id = $15
       RETURNING *`,
      [
        name?.trim(),
        slug !== undefined ? slugify(slug || name) : null,
        brand?.trim(),
        category?.trim(),
        hasSubcategoryPatch,
        subcategory?.trim() || null,
        shortDescription?.trim(),
        description?.trim(),
        parsedPrice,
        parsedStock,
        imageData,
        typeof isFeatured === "boolean" ? isFeatured : null,
        typeof isPublished === "boolean" ? isPublished : null,
        Number.isFinite(Number(displayOrder)) ? Number(displayOrder) : null,
        req.params.id,
      ]
    );

    if (!result.rows.length) return res.status(404).json({ error: "Produit introuvable" });
    res.json(serializeProduct(result.rows[0]));
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Ce slug produit est deja utilise." });
    }
    console.error("Error updating product:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/:id", authenticateAdmin, async (req, res) => {
  try {
    await ensureProductsTable();
    await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting product:", err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
