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

// Render est derrière un proxy
app.set('trust proxy', 1);

// 1. CORS centralisé - une seule source de vérité
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://mobile-barbershop-frontend.vercel.app",
  "https://mrrenaudinbarbershop.com",
  "https://www.mrrenaudinbarbershop.com",
];

const corsOptions = {
  origin: (origin, cb) => {
    // Autorise requêtes sans origin comme Postman/mobile
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    console.log('CORS blocked:', origin);
    cb(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

// 3. Static avec même CORS que l'API
app.use(
  "/sounds",
  express.static("sounds", {
    setHeaders: (res, path) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Cache-Control", "public, max-age=31536000");
    },
  })
);

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

// 4. Middleware auth réutilisable
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token" });
  }
  try {
    const token = authHeader.split(" ")[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// === ROUTES CHAT ===
app.get("/api/messages", authenticate, async (req, res) => {
  try {
    const user = req.user;
    const query =
      user.role === "admin"
       ? "SELECT id, sender, recipient, message, timestamp, is_read FROM messages ORDER BY timestamp ASC"
        : "SELECT id, sender, recipient, message, timestamp, is_read FROM messages WHERE sender = $1 OR recipient = $1 ORDER BY timestamp ASC";

    const params = user.role === "admin"? [] : [user.id.toString()];
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
    console.error("Error fetching messages:", err.message);
    res.status(500).json({ error: "Error fetching messages" });
  }
});

app.put("/api/messages/markAsRead", authenticate, async (req, res) => {
  try {
    const user = req.user;
    await pool.query(
      "UPDATE messages SET is_read = true WHERE recipient = $1 AND is_read = false",
      [user.id.toString()]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error marking messages as read:", err.message);
    res.status(500).json({ error: "Error marking messages as read" });
  }
});

app.use("/api/announcements", require("./routes/announcementRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/booking", require("./routes/bookingRoutes"));
app.use("/api/contact", require("./routes/contactRoutes"));

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Global error:", err.stack);
  res.status(500).json({ error: "Internal server error" });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: allowedOrigins, 
    methods: ["GET", "POST"],
    credentials: true 
  },
});

// 5. Gestion propre des clients + admin
const clientsMap = new Map();
let adminSocket = null;
let isAdminOnline = false;

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication missing"));
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    if (!["admin", "client"].includes(user.role)) {
      return next(new Error("Invalid user role"));
    }
    socket.user = user;
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

const getTargetSocketId = (target) => {
  if (target === "admin") return adminSocket?.id || null;
  return clientsMap.get(target)?.socketId || null;
};

io.on("connection", (socket) => {
  const user = socket.user;
  console.log(`${user.role} connected: ${user.username || user.name || user.id}`);

  if (user.role === "admin") {
    if (adminSocket) {
      socket.emit("error", { message: "Another admin is already connected" });
      return socket.disconnect(true);
    }
    adminSocket = socket;
    isAdminOnline = true;
    socket.emit("update_client_list", Array.from(clientsMap.values()));
    io.emit("admin_status", { online: true });

    socket.on("send_announcement", async ({ title, content }) => {
      if (socket.user.role!== "admin") return;
      if (!title ||!content) {
        return socket.emit("error", { message: "Title or content missing" });
      }
      try {
        const result = await pool.query(
          "INSERT INTO announcements (title, content, created_at) VALUES ($1, $2, NOW()) RETURNING *",
          [title, content]
        );
        io.emit("new_announcement", result.rows[0]);
      } catch (err) {
        console.error("Error adding announcement:", err.message);
        socket.emit("error", { message: "Error adding announcement" });
      }
    });

  } else if (user.role === "client") {
    clientsMap.set(user.id, {
      id: user.id,
      name: user.username || user.name || `Client ${user.id}`,
      socketId: socket.id,
      online: true,
    });
    if (adminSocket) {
      adminSocket.emit("update_client_list", Array.from(clientsMap.values()));
    }
    socket.emit("admin_status", { online: isAdminOnline });

    socket.on("send_message_to_admin", async ({ message }) => {
      if (!message?.trim()) return socket.emit("error", { message: "Message is empty" });
      if (!adminSocket) return socket.emit("error", { message: "No admin connected" });
      try {
        const savedMessage = await saveMessage(user.id.toString(), "admin", message);
        adminSocket.emit("new_message", {
          sender: user.username || user.name || `Client ${user.id}`,
          senderId: user.id.toString(),
          message: savedMessage.message,
          timestamp: savedMessage.timestamp,
        });
      } catch (err) {
        console.error("Error saving message:", err.message);
        socket.emit("error", { message: "Error saving message" });
      }
    });
  }

  socket.on("send_message_to_client", async ({ clientId, message }) => {
    if (user.role!== "admin") {
      return socket.emit("error", { message: "Only admin can send messages to clients" });
    }
    if (!clientId ||!message?.trim()) {
      return socket.emit("error", { message: "Client ID or message missing" });
    }
    const client = clientsMap.get(clientId);
    if (client?.socketId) {
      try {
        const savedMessage = await saveMessage("admin", clientId.toString(), message);
        io.to(client.socketId).emit("new_message", {
          sender: "admin",
          senderId: "admin",
          message: savedMessage.message,
          timestamp: savedMessage.timestamp,
        });
      } catch (err) {
        console.error("Error sending message to client:", err.message);
        socket.emit("error", { message: "Error sending message" });
      }
    } else {
      socket.emit("error", { message: "Client not found or disconnected" });
    }
  });

  socket.on("call_offer", (data) => {
    const targetSocketId = getTargetSocketId(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_offer", {
        from: user.id.toString(),
        callType: data.callType,
        offer: data.offer,
      });
      socket.emit("call_status", { status: "offer_sent", to: data.to });
    } else {
      socket.emit("error", { message: "Call recipient not available" });
    }
  });

  socket.on("call_answer", (data) => {
    const targetSocketId = getTargetSocketId(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_answer", {
        from: user.id.toString(),
        answer: data.answer,
      });
      socket.emit("call_status", { status: "answer_sent", to: data.to });
    } else {
      socket.emit("error", { message: "Call recipient not available" });
    }
  });

  socket.on("call_candidate", (data) => {
    const targetSocketId = getTargetSocketId(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_candidate", {
        from: user.id.toString(),
        candidate: data.candidate,
      });
    }
  });

  socket.on("call_reject", (data) => {
    const targetSocketId = getTargetSocketId(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_reject", { from: user.id.toString() });
      socket.emit("call_status", { status: "reject_sent", to: data.to });
    } else {
      socket.emit("error", { message: "Call recipient not available" });
    }
  });

  socket.on("call_busy", (data) => {
    const targetSocketId = getTargetSocketId(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_busy", { from: user.id.toString() });
    }
  });

  socket.on("call_end", (data) => {
    const targetSocketId = getTargetSocketId(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_end", { from: user.id.toString() });
      socket.emit("call_status", { status: "end_sent", to: data.to });
    }
    socket.emit("call_end", { from: user.id.toString() });
  });

  socket.on("disconnect", () => {
    console.log(`${user.role} disconnected: ${user.username || user.name || user.id}`);
    if (user.role === "client") {
      clientsMap.delete(user.id);
      if (adminSocket) {
        adminSocket.emit("update_client_list", Array.from(clientsMap.values()));
      }
    } else if (user.role === "admin" && adminSocket?.id === socket.id) {
      adminSocket = null;
      isAdminOnline = false;
      io.emit("admin_status", { online: false });
    }
  });
});

async function saveMessage(sender, recipient, message) {
  const result = await pool.query(
    "INSERT INTO messages (sender, recipient, message, timestamp, is_read) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, false) RETURNING *",
    [sender, recipient, message]
  );
  return result.rows[0];
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});