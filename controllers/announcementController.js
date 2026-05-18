// controllers/announcementController.js
const pool   = require("../db/pool");
const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SMTP_PASS);

const FROM_EMAIL = {
  email: "mrrenaudinbarber@gmail.com",
  name:  "Mr. Renaudin Barbershop",
};

const SHOP_INFO = {
  name:    "Mr. Renaudin Barbershop",
  address: "462 4e Rue de la Pointe",
  city:    "Shawinigan, QC G9N 1G7",
  phone:   "(514) 778-8318",
  website: "https://mrrenaudinbarbershop.com",
};

// ─── Email HTML ───────────────────────────────────────────────────────────────
const buildAnnouncementEmail = (clientName, title, content) => {
  const text = `
Bonjour ${clientName},

${SHOP_INFO.name} a publié une nouvelle annonce :

${title}
${"─".repeat(40)}
${content}
${"─".repeat(40)}

Visitez notre site pour réserver votre prochain rendez-vous :
${SHOP_INFO.website}

${SHOP_INFO.name}
${SHOP_INFO.address}, ${SHOP_INFO.city}
${SHOP_INFO.phone}
  `.trim();

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:#f5f5f5;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#ffffff;border:1px solid #d9d9d9;max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="background:#0e1015;padding:30px 35px;text-align:center;
                        border-bottom:3px solid #d4a843;">
              <h1 style="margin:0;color:#d4a843;font-family:Georgia,serif;
                          font-size:22px;font-weight:bold;letter-spacing:2px;">
                ${SHOP_INFO.name.toUpperCase()}
              </h1>
              <p style="margin:8px 0 0;color:#7888a0;font-size:12px;
                         letter-spacing:0.15em;text-transform:uppercase;">
                Nouvelle Annonce
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:35px 40px;">
              <p style="margin:0 0 6px;color:#7888a0;font-size:11px;
                         text-transform:uppercase;letter-spacing:0.1em;">
                Bonjour ${clientName},
              </p>
              <p style="margin:0 0 28px;color:#333;font-size:14px;line-height:1.6;">
                Une nouvelle annonce vient d'être publiée par votre barbershop.
              </p>

              <!-- Announcement card -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                     style="border:1px solid #d9d9d9;margin-bottom:28px;">
                <tr>
                  <td style="background:#0e1015;padding:14px 20px;
                              border-bottom:2px solid #d4a843;">
                    <h2 style="margin:0;color:#d4a843;font-family:Georgia,serif;
                                font-size:18px;font-weight:bold;">
                      ${title}
                    </h2>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;background:#fafafa;">
                    <p style="margin:0;color:#333;font-size:14px;line-height:1.75;
                               white-space:pre-line;">
                      ${content}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding:10px 0;">
                    <a href="${SHOP_INFO.website}/reserver"
                       style="display:inline-block;background:#d4a843;color:#0e1015;
                               text-decoration:none;padding:13px 30px;font-size:12px;
                               font-weight:bold;letter-spacing:1px;text-transform:uppercase;
                               border:1px solid #d4a843;">
                      Réserver un rendez-vous
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0e1015;padding:25px 35px;text-align:center;">
              <p style="margin:0 0 8px;color:#fff;font-size:13px;font-weight:bold;">
                ${SHOP_INFO.name}
              </p>
              <p style="margin:0;color:#7888a0;font-size:11px;line-height:1.8;">
                ${SHOP_INFO.address}, ${SHOP_INFO.city}<br>
                ${SHOP_INFO.phone} ·
                <a href="${SHOP_INFO.website}" style="color:#d4a843;text-decoration:none;">
                  ${SHOP_INFO.website}
                </a>
              </p>
              <p style="margin:16px 0 0;color:#4a5468;font-size:10px;">
                Vous recevez cet email car vous avez un compte sur ${SHOP_INFO.website}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return { text, html };
};

// ─── Broadcast à tous les clients ─────────────────────────────────────────────
const broadcastToClients = async (title, content) => {
  try {
    // Récupérer tous les clients ayant un email
    const result = await pool.query(
      `SELECT id, username, email, first_name
       FROM users
       WHERE role = 'client'
         AND email IS NOT NULL
         AND email != ''
       ORDER BY id`
    );

    const clients = result.rows;
    if (!clients.length) {
      console.log("[broadcast] Aucun client avec email.");
      return { sent: 0, failed: 0 };
    }

    console.log(`[broadcast] Envoi à ${clients.length} client(s)…`);

    // Envoi en batch via l'API SendGrid (max 1000 destinataires par appel)
    // On utilise personalizations pour personnaliser le nom de chaque client
    const BATCH_SIZE = 1000;
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const batch = clients.slice(i, i + BATCH_SIZE);

      // Envoi individuel pour personnalisation (nom du client)
      // Pour les petits volumes (<200 clients), c'est parfaitement adapté
      const promises = batch.map(async (client) => {
        const name = client.first_name || client.username;
        const { text, html } = buildAnnouncementEmail(name, title, content);
        try {
          await sgMail.send({
            to:      client.email,
            from:    FROM_EMAIL,
            subject: `📢 ${title} — ${SHOP_INFO.name}`,
            text,
            html,
          });
          return { ok: true };
        } catch (err) {
          console.error(`[broadcast] Échec pour ${client.email}:`, err.message);
          return { ok: false };
        }
      });

      // Limiter les requêtes simultanées (max 10 à la fois)
      const CONCURRENCY = 10;
      for (let j = 0; j < promises.length; j += CONCURRENCY) {
        const results = await Promise.allSettled(promises.slice(j, j + CONCURRENCY));
        results.forEach(r => {
          if (r.status === "fulfilled" && r.value.ok) sent++;
          else failed++;
        });
      }
    }

    console.log(`[broadcast] ✓ ${sent} envoyés, ${failed} échecs`);
    return { sent, failed };

  } catch (err) {
    console.error("[broadcast] Erreur générale:", err.message);
    return { sent: 0, failed: 0 };
  }
};

// ─── CONTROLLERS ─────────────────────────────────────────────────────────────

// GET / — Toutes les annonces
exports.getAllAnnouncements = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM announcements ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Erreur getAllAnnouncements:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// POST / — Créer une annonce + broadcast email
exports.createAnnouncement = async (req, res) => {
  const { title, content } = req.body;
  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ message: "Titre et contenu sont requis" });
  }

  try {
    // 1. Sauvegarder en DB
    const result = await pool.query(
      `INSERT INTO announcements (title, content, created_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       RETURNING *`,
      [title.trim(), content.trim()]
    );
    const announcement = result.rows[0];

    // 2. Répondre immédiatement (ne pas bloquer sur les emails)
    res.status(201).json(announcement);

    // 3. Broadcast en arrière-plan (fire and forget)
    broadcastToClients(title.trim(), content.trim())
      .then(({ sent, failed }) => {
        console.log(`[annonce #${announcement.id}] Emails: ${sent} envoyés, ${failed} échecs`);
      })
      .catch(err => {
        console.error(`[annonce #${announcement.id}] Broadcast error:`, err.message);
      });

  } catch (err) {
    console.error("Erreur createAnnouncement:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// PUT /:id — Modifier (sans re-broadcast — c'est une correction, pas une nouvelle annonce)
exports.updateAnnouncement = async (req, res) => {
  const { id }      = req.params;
  const { title, content } = req.body;
  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ message: "Titre et contenu sont requis" });
  }
  try {
    const result = await pool.query(
      `UPDATE announcements
       SET title = $1, content = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [title.trim(), content.trim(), id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ message: "Annonce non trouvée" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erreur updateAnnouncement:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// DELETE /:id
exports.deleteAnnouncement = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM announcements WHERE id = $1 RETURNING *",
      [id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ message: "Annonce non trouvée" });
    }
    res.status(204).send();
  } catch (err) {
    console.error("Erreur deleteAnnouncement:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};