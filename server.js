require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const http = require("http");
const { Server } = require("socket.io");

const pool = require("./db/pool");

if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is not set");
  process.exit(1);
}

const app = express();
app.set("trust proxy", 1);

// ================= CONFIG =================
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://mobile-barbershop-frontend.vercel.app",
  "https://mrrenaudinbarbershop.com",
  "https://www.mrrenaudinbarbershop.com",
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      console.log("CORS blocked:", origin);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "8mb" }));

// ================= STATIC =================
app.use(
  "/sounds",
  express.static("sounds", {
    setHeaders: (res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Cache-Control", "public, max-age=31536000");
    },
  })
);

// ================= HEALTH =================
app.get("/", (req, res) => res.send("Backend is running!"));

app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ success: true, time: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= AUTH MIDDLEWARE =================
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token" });
  }
  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// ================= MESSAGES API =================
app.get("/api/messages", authenticate, async (req, res) => {
  try {
    const user = req.user;
    const { clientId } = req.query;
    let query = "";
    let params = [];

    if (user.role === "admin") {
      if (clientId) {
        query = `
          SELECT
            m.id,
            m.sender as "senderId",
            CASE
              WHEN m.sender = 'admin' THEN 'Mr. Renaudin Barbershop'
              ELSE COALESCE(u.username, 'Client ' || m.sender)
            END as "senderName",
            m.recipient as "recipientId",
            m.message,
            m.timestamp,
            m.is_read
          FROM messages m
          LEFT JOIN users u ON u.id::text = m.sender
          WHERE (m.sender = $1 AND m.recipient = 'admin')
             OR (m.sender = 'admin' AND m.recipient = $1)
          ORDER BY m.timestamp ASC
        `;
        params = [clientId.toString()];
      } else {
        query = `
          SELECT
            m.id,
            m.sender as "senderId",
            CASE
              WHEN m.sender = 'admin' THEN 'Mr. Renaudin Barbershop'
              ELSE COALESCE(u.username, 'Client ' || m.sender)
            END as "senderName",
            m.recipient as "recipientId",
            m.message,
            m.timestamp,
            m.is_read
          FROM messages m
          LEFT JOIN users u ON u.id::text = m.sender
          ORDER BY m.timestamp ASC
        `;
      }
    } else {
      query = `
        SELECT
          m.id,
          m.sender as "senderId",
          CASE
            WHEN m.sender = 'admin' THEN 'Mr. Renaudin Barbershop'
            ELSE COALESCE(u.username, 'Client ' || m.sender)
          END as "senderName",
          m.recipient as "recipientId",
          m.message,
          m.timestamp,
          m.is_read
        FROM messages m
        LEFT JOIN users u ON u.id::text = m.sender
        WHERE (m.sender = $1 AND m.recipient = 'admin')
           OR (m.sender = 'admin' AND m.recipient = $1)
        ORDER BY m.timestamp ASC
      `;
      params = [user.id.toString()];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch messages error:", err.message);
    res.status(500).json({ error: "Error fetching messages" });
  }
});

// ================= ROUTES =================
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/booking", require("./routes/bookingRoutes"));
app.use("/api/contact", require("./routes/contactRoutes"));
app.use("/api/announcements", require("./routes/announcementRoutes"));
app.use("/api/gallery", require("./routes/galleryRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));

app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) => {
  console.error("Global error:", err.stack);
  res.status(500).json({ error: "Internal server error" });
});

// ================= SERVER + SOCKET.IO =================
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ── State maps ────────────────────────────────────────────────────────────────
const clientsMap = new Map();   // clientId → { id, name, socketId, online }
const adminSockets = new Set(); // Set of socket.id

// ── Socket auth middleware ────────────────────────────────────────────────────
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication missing"));
    const user = jwt.verify(token, process.env.JWT_SECRET);
    if (!["admin", "client"].includes(user.role))
      return next(new Error("Invalid role"));
    socket.user = user;
    next();
  } catch (err) {
    console.error("Socket auth error:", err.message);
    next(new Error("Invalid token"));
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const emitAdminClientList = () => {
  const clients = Array.from(clientsMap.values());
  adminSockets.forEach((socketId) => {
    io.to(socketId).emit("update_client_list", clients);
  });
};

const emitAdminStatus = (online) => {
  io.emit("admin_status", { online });
};

// ── Connection handler ────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  const user = socket.user;
  console.log("CONNECTED:", user.role, user.id);

  socket.join(`user:${user.id}`);
  if (user.role === "admin") socket.join("admins");

  if (user.role === "admin") {
    adminSockets.add(socket.id);
    emitAdminClientList();
    emitAdminStatus(true);
  }

  if (user.role === "client") {
    clientsMap.set(user.id.toString(), {
      id: user.id.toString(),
      name: user.username || `Client ${user.id}`,
      socketId: socket.id,
      online: true,
    });
    emitAdminClientList();
    socket.emit("admin_status", { online: adminSockets.size > 0 });
  }

  // ── CLIENT → ADMIN ────────────────────────────────────────────────────────
  socket.on("send_message_to_admin", async ({ message }, callback) => {
    try {
      if (!message?.trim()) return callback?.({ success: false, error: "Empty message" });

      const saved = await saveMessage(user.id.toString(), "admin", message.trim());
      const payload = {
        id: saved.id,
        senderId: user.id.toString(),
        senderName: user.username || `Client ${user.id}`,
        recipientId: "admin",
        message: saved.message,
        timestamp: saved.timestamp,
        is_read: false,
      };

      // Deliver to all admin sockets AND echo back to this client
      io.to("admins").emit("new_message", payload);
      io.to(`user:${user.id}`).emit("new_message", payload);
      callback?.({ success: true, message: saved });
    } catch (err) {
      console.error("send_message_to_admin error:", err);
      callback?.({ success: false, error: "Message failed" });
    }
  });

  // ── ADMIN → CLIENT ────────────────────────────────────────────────────────
  socket.on("send_message_to_client", async ({ clientId, message }, callback) => {
    try {
      if (user.role !== "admin")
        return callback?.({ success: false, error: "Unauthorized" });
      if (!message?.trim())
        return callback?.({ success: false, error: "Empty message" });
      if (!clientId)
        return callback?.({ success: false, error: "No client selected" });

      const saved = await saveMessage("admin", clientId.toString(), message.trim());
      const payload = {
        id: saved.id,
        senderId: "admin",
        senderName: "Mr. Renaudin Barbershop",
        recipientId: clientId.toString(),
        message: saved.message,
        timestamp: saved.timestamp,
        is_read: false,
      };

      // Deliver to the target client room AND all admin sockets (multi-tab support)
      io.to(`user:${clientId}`).emit("new_message", payload);
      io.to("admins").emit("new_message", payload);
      callback?.({ success: true, message: saved });
    } catch (err) {
      console.error("send_message_to_client error:", err);
      callback?.({ success: false, error: "Message failed" });
    }
  });

  // ── READ RECEIPTS ─────────────────────────────────────────────────────────
  // FIX: This handler was missing entirely from the original server.
  // `messageIds` — array of message IDs to mark as read
  // `to`         — the sender of those messages (who should receive the receipt)
  socket.on("message_read", async ({ messageIds, to }) => {
    try {
      if (!Array.isArray(messageIds) || messageIds.length === 0) return;

      // Persist to DB
      await pool.query(
        `UPDATE messages SET is_read = true WHERE id = ANY($1::int[])`,
        [messageIds]
      );

      // Notify the original sender so their ✓ turns into ✓✓
      if (to === "admin") {
        io.to("admins").emit("messages_read", { messageIds });
      } else {
        io.to(`user:${to}`).emit("messages_read", { messageIds });
      }
    } catch (err) {
      console.error("message_read error:", err);
    }
  });

  // ── TYPING INDICATOR ──────────────────────────────────────────────────────
  // FIX: Original broadcast to ALL sockets. Now we relay only to the correct room.
  // Payload: { to: "admin" | clientId, isTyping: bool }
  socket.on("typing", ({ to, isTyping }) => {
    try {
      if (!to) return;

      const typingPayload = {
        from: user.role === "admin" ? "admin" : user.id.toString(),
        isTyping: Boolean(isTyping),
      };

      if (to === "admin") {
        // Client is typing → relay to admin room only
        io.to("admins").emit("typing", typingPayload);
      } else {
        // Admin is typing → relay to specific client room only
        io.to(`user:${to}`).emit("typing", typingPayload);
      }
    } catch (err) {
      console.error("typing error:", err);
    }
  });

  // ── WEBRTC CALL RELAY ─────────────────────────────────────────────────────
  const callEvents = [
    "call_offer",
    "call_answer",
    "call_candidate",
    "call_reject",
    "call_busy",
    "call_end",
  ];

  callEvents.forEach((event) => {
    socket.on(event, (data) => {
      try {
        if (!data?.to) return;
        const from = user.id.toString();
        if (data.to === "admin") {
          io.to("admins").emit(event, { from, ...data });
        } else {
          io.to(`user:${data.to}`).emit(event, { from, ...data });
        }
      } catch (err) {
        console.error(`${event} error:`, err);
      }
    });
  });

  // ── DISCONNECT ────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log("DISCONNECTED:", user.role, user.id);
    if (user.role === "client") {
      clientsMap.delete(user.id.toString());
      emitAdminClientList();
    }
    if (user.role === "admin") {
      adminSockets.delete(socket.id);
      if (adminSockets.size === 0) emitAdminStatus(false);
    }
  });
});

// ================= DATABASE HELPERS =================
async function saveMessage(sender, recipient, message) {
  const result = await pool.query(
    `INSERT INTO messages (sender, recipient, message, timestamp, is_read)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, false)
     RETURNING *`,
    [sender, recipient, message]
  );
  return result.rows[0];
}

// ================= START =================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
