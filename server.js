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

// ================= MESSAGES =================
app.get("/api/messages", authenticate, async (req, res) => {
  try {
    const user = req.user;
    const { clientId } = req.query;
    let query = "";
    let params = [];

    if (user.role === "admin") {
      if (clientId) {
        query = `
          SELECT id, sender, recipient, message, timestamp, is_read
          FROM messages
          WHERE (sender = $1 AND recipient = 'admin')
             OR (sender = 'admin' AND recipient = $1)
          ORDER BY timestamp ASC
        `;
        params = [clientId.toString()];
      } else {
        query = `
          SELECT id, sender, recipient, message, timestamp, is_read
          FROM messages
          ORDER BY timestamp ASC
        `;
      }
    } else {
      query = `
        SELECT id, sender, recipient, message, timestamp, is_read
        FROM messages
        WHERE (sender = $1 AND recipient = 'admin')
           OR (sender = 'admin' AND recipient = $1)
        ORDER BY timestamp ASC
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

app.put("/api/messages/markAsRead", authenticate, async (req, res) => {
  try {
    const user = req.user;
    const { clientId } = req.body;
    let query = "";
    let params = [];

    if (user.role === "admin" && clientId) {
      query = `
        UPDATE messages
        SET is_read = true
        WHERE sender = $1 AND recipient = 'admin' AND is_read = false
      `;
      params = [clientId.toString()];
    } else {
      query = `
        UPDATE messages
        SET is_read = true
        WHERE sender = 'admin' AND recipient = $1 AND is_read = false
      `;
      params = [user.id.toString()];
    }

    await pool.query(query, params);
    res.json({ success: true });
  } catch (err) {
    console.error("Mark read error:", err.message);
    res.status(500).json({ error: "Error marking messages" });
  }
});

// ================= ROUTES =================
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/booking", require("./routes/bookingRoutes"));
app.use("/api/contact", require("./routes/contactRoutes"));
app.use("/api/announcements", require("./routes/announcementRoutes"));

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

const clientsMap = new Map();
const adminSockets = new Set();

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication missing"));
    const user = jwt.verify(token, process.env.JWT_SECRET);
    if (!["admin", "client"].includes(user.role)) return next(new Error("Invalid role"));
    socket.user = user;
    next();
  } catch (err) {
    console.error("Socket auth error:", err.message);
    next(new Error("Invalid token"));
  }
});

const emitAdminClientList = () => {
  const clients = Array.from(clientsMap.values());
  adminSockets.forEach((socketId) => {
    io.to(socketId).emit("update_client_list", clients);
  });
};

const emitAdminStatus = (online) => {
  io.emit("admin_status", { online });
};

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

  // SEND MESSAGE TO ADMIN
  // SEND MESSAGE TO ADMIN
socket.on("send_message_to_admin", async ({ message }, callback) => {
  try {
    if (!message?.trim()) return;
    const saved = await saveMessage(user.id.toString(), "admin", message.trim());
    const payload = {
      id: saved.id,
      senderId: user.id.toString(), // ID pour la logique
      senderName: user.username || `Client ${user.id}`, // Nom pour l’affichage
      recipientId: "admin",
      message: saved.message,
      timestamp: saved.timestamp,
      is_read: saved.is_read,
    };
    io.to("admins").emit("new_message", payload);
    io.to(`user:${user.id}`).emit("new_message", payload);
    callback?.({ success: true, message: saved });
  } catch (err) {
    console.error("send_message_to_admin error:", err);
    callback?.({ success: false, error: "Message failed" });
  }
});

// SEND MESSAGE TO CLIENT
socket.on("send_message_to_client", async ({ clientId, message }, callback) => {
  try {
    if (user.role!== "admin") return;
    if (!message?.trim()) return;
    const saved = await saveMessage("admin", clientId.toString(), message.trim());
    const payload = {
      id: saved.id,
      senderId: "admin", // ID pour la logique
      senderName: "Mr. Renaudin Barbershop", // Nom pour l’affichage
      recipientId: clientId.toString(),
      message: saved.message,
      timestamp: saved.timestamp,
      is_read: saved.is_read,
    };
    io.to(`user:${clientId}`).emit("new_message", payload);
    io.to("admins").emit("new_message", payload);
    callback?.({ success: true, message: saved });
  } catch (err) {
    console.error("send_message_to_client error:", err);
    callback?.({ success: false, error: "Message failed" });
  }
});

  // CALL SYSTEM
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
        if (data.to === "admin") {
          io.to("admins").emit(event, { from: user.id.toString(),...data });
          return;
        }
        io.to(`user:${data.to}`).emit(event, { from: user.id.toString(),...data });
      } catch (err) {
        console.error(`${event} error:`, err);
      }
    });
  });

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

// ================= DATABASE =================
async function saveMessage(sender, recipient, message) {
  const result = await pool.query(
    `
    INSERT INTO messages (sender, recipient, message, timestamp, is_read)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP, false)
    RETURNING *
    `,
    [sender, recipient, message]
  );
  return result.rows[0];
}

// ================= START SERVER =================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});