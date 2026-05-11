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
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

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
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ success: true, time: result.rows[0] });
  } catch (err) {
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
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// ================= MESSAGES =================
app.get("/api/messages", authenticate, async (req, res) => {
  try {
    const user = req.user;

    const query =
      user.role === "admin"
        ? `SELECT * FROM messages ORDER BY timestamp ASC`
        : `SELECT * FROM messages
           WHERE sender = $1 OR recipient = $1
           ORDER BY timestamp ASC`;

    const params = user.role === "admin" ? [] : [user.id.toString()];

    const result = await pool.query(query, params);

    res.json(
      result.rows.map((msg) => ({
        id: msg.id,
        sender_id: msg.sender,
        recipient_id: msg.recipient,
        message: msg.message,
        timestamp: msg.timestamp,
        read: msg.is_read,
      }))
    );
  } catch (err) {
    console.error("Fetch messages error:", err.message);
    res.status(500).json({ error: "Error fetching messages" });
  }
});

app.put("/api/messages/markAsRead", authenticate, async (req, res) => {
  try {
    const user = req.user;

    await pool.query(
      `UPDATE messages
       SET is_read = true
       WHERE recipient = $1`,
      [user.id.toString()]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Mark read error:", err.message);
    res.status(500).json({ error: "Error marking messages" });
  }
});

// ================= ROUTES =================
app.use("/api/announcements", require("./routes/announcementRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/booking", require("./routes/bookingRoutes"));
app.use("/api/contact", require("./routes/contactRoutes"));

// ================= ERROR HANDLERS =================
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Global error:", err.stack);
  res.status(500).json({ error: "Internal server error" });
});

// ================= SERVER =================
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ================= STATE =================
const clientsMap = new Map();
let adminSocket = null;
let isAdminOnline = false;

// ================= SOCKET AUTH =================
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) return next(new Error("Authentication missing"));

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);

    if (!["admin", "client"].includes(user.role)) {
      return next(new Error("Invalid role"));
    }

    socket.user = user;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

// ================= HELPERS =================
const getSocket = (target) => {
  if (target === "admin") return adminSocket?.id;
  return clientsMap.get(target)?.socketId;
};

// ================= SOCKET =================
io.on("connection", (socket) => {
  const user = socket.user;

  console.log("CONNECTED:", user.role, user.id);

  // ---------- ADMIN ----------
  if (user.role === "admin") {
    adminSocket = socket;
    isAdminOnline = true;

    socket.emit(
      "update_client_list",
      Array.from(clientsMap.values())
    );

    io.emit("admin_status", { online: true });
  }

  // ---------- CLIENT ----------
  if (user.role === "client") {
    clientsMap.set(user.id, {
      id: user.id,
      name: user.username || `Client ${user.id}`,
      socketId: socket.id,
      online: true,
    });

    adminSocket?.emit(
      "update_client_list",
      Array.from(clientsMap.values())
    );

    socket.emit("admin_status", { online: isAdminOnline });
  }

  // ================= MESSAGES =================
  socket.on("send_message_to_admin", async ({ message }) => {
    if (!message?.trim()) return;

    if (!adminSocket) return;

    const saved = await saveMessage(
      user.id.toString(),
      "admin",
      message
    );

    adminSocket.emit("new_message", {
      sender: user.username || `Client ${user.id}`,
      senderId: user.id.toString(),
      message: saved.message,
      timestamp: saved.timestamp,
    });
  });

  socket.on(
    "send_message_to_client",
    async ({ clientId, message }) => {
      if (user.role !== "admin") return;

      const client = clientsMap.get(clientId);
      if (!client) return;

      const saved = await saveMessage(
        "admin",
        clientId.toString(),
        message
      );

      io.to(client.socketId).emit("new_message", {
        sender: "admin",
        senderId: "admin",
        message: saved.message,
        timestamp: saved.timestamp,
      });
    }
  );

  // ================= TYPING =================
  socket.on("typing", ({ to, isTyping }) => {
    const target = getSocket(to);
    if (target) {
      io.to(target).emit("typing", {
        from: user.id.toString(),
        isTyping,
      });
    }
  });

  // ================= READ RECEIPTS =================
  socket.on("message_read", async ({ messageIds }) => {
    if (!Array.isArray(messageIds)) return;

    await pool.query(
      `UPDATE messages SET is_read = true WHERE id = ANY($1)`,
      [messageIds]
    );

    socket.broadcast.emit("messages_read", {
      messageIds,
    });
  });

  // ================= CALL SYSTEM =================
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
      const target = getSocket(data.to);

      if (target) {
        io.to(target).emit(event, {
          from: user.id.toString(),
          ...data,
        });
      }
    });
  });

  // ================= DISCONNECT =================
  socket.on("disconnect", () => {
    console.log("DISCONNECT:", user.id);

    if (user.role === "client") {
      clientsMap.delete(user.id);

      adminSocket?.emit(
        "update_client_list",
        Array.from(clientsMap.values())
      );
    }

    if (
      user.role === "admin" &&
      adminSocket?.id === socket.id
    ) {
      adminSocket = null;
      isAdminOnline = false;

      io.emit("admin_status", { online: false });
    }
  });
});

// ================= DB =================
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
  console.log("Server running on port", PORT);
});