require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const http = require("http");
const { Server } = require("socket.io");
const pool = require("./db/pool");

const app = express();

/* === Middleware Setup === */

// Configure CORS to allow trusted origins
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://mobile-barbershop-frontend.vercel.app",
      "https://mrrenaudinbarbershop.com",
      "https://www.mrrenaudinbarbershop.com",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Parse incoming JSON requests
app.use(express.json());
app.options("*", cors());

// Serve static audio files with appropriate CORS headers
app.use(
  "/sounds",
  express.static("sounds", {
    setHeaders: (res) => {
      res.set("Access-Control-Allow-Origin", "*");
    },
  })
);

/* === REST API Routes === */

app.get("/", (req, res) => {
  res.send("Backend is running!");
});

app.use("/api/announcements", require("./routes/announcementRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/send-email", require("./routes/bookingRoutes"));
app.use("/api/contact", require("./routes/contactRoutes"));

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Global error:", err.stack);
  res.status(500).json({ error: "Internal server error" });
});

/* === HTTP & Socket.IO Server Setup === */

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://mobile-barbershop-frontend.vercel.app",
    ],
    methods: ["GET", "POST"],
  },
});

/* === Socket.IO Connection Management === */

const clientsMap = {};
let adminSocket = null;
let isAdminOnline = false;

// Socket.IO authentication middleware
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
    console.error("JWT authentication error:", err.message);
    next(new Error("Invalid token"));
  }
});

// Helper function to determine the target socket ID
const getTargetSocketId = (target) => {
  if (target === "admin") return adminSocket ? adminSocket.id : null;
  return clientsMap[target] ? clientsMap[target].socketId : null;
};

io.on("connection", (socket) => {
  const user = socket.user;
  console.log(`${user.role} connected: ${user.username || user.name || user.id} (socket: ${socket.id})`);

  if (user.role === "admin") {
    if (adminSocket) {
      console.log("Another admin is already connected. Disconnecting duplicate.");
      return socket.disconnect();
    }
    adminSocket = socket;
    isAdminOnline = true;
    socket.emit("update_client_list", Object.values(clientsMap));
    io.emit("admin_status", { online: true });

    socket.on("send_announcement", async ({ title, content }) => {
      if (!title || !content) {
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
    clientsMap[user.id] = {
      id: user.id,
      name: user.username || user.name || `Client ${user.id}`,
      socketId: socket.id,
    };
    if (adminSocket) {
      adminSocket.emit("update_client_list", Object.values(clientsMap));
    }
    socket.emit("admin_status", { online: isAdminOnline });

    socket.on("send_message_to_admin", async ({ message }) => {
      if (!message) return socket.emit("error", { message: "Message is empty" });
      if (adminSocket) {
        try {
          const savedMessage = await saveMessage(user.id, "admin", message);
          adminSocket.emit("new_message", {
            sender: user.username || user.name || `Client ${user.id}`,
            senderId: user.id,
            message: savedMessage.message,
          });
        } catch (err) {
          console.error("Error saving message:", err.message);
          socket.emit("error", { message: "Error saving message" });
        }
      } else {
        socket.emit("error", { message: "No admin connected" });
      }
    });
  }

  socket.on("send_message_to_client", async ({ clientId, message }) => {
    if (user.role !== "admin") {
      return socket.emit("error", { message: "Only admin can send messages to clients" });
    }
    if (!clientId || !message) {
      return socket.emit("error", { message: "Client ID or message missing" });
    }
    const clientSocketId = clientsMap[clientId]?.socketId;
    if (clientSocketId) {
      try {
        const savedMessage = await saveMessage("admin", clientId, message);
        io.to(clientSocketId).emit("new_message", {
          sender: "admin",
          senderId: "admin",
          message: savedMessage.message,
        });
      } catch (err) {
        console.error("Error sending message to client:", err.message);
        socket.emit("error", { message: "Error sending message" });
      }
    } else {
      console.error(`Client not found or disconnected: ${clientId}`);
      socket.emit("error", { message: "Client not found or disconnected" });
    }
  });

  /* --- WebRTC Signaling Events --- */

  socket.on("call_offer", (data) => {
    const { to, callType, offer } = data;
    const targetSocketId = getTargetSocketId(to);
    console.log(`call_offer received from ${user.id} (socket: ${socket.id}) to ${to}`);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_offer", {
        from: user.id,
        callType,
        offer,
      });
      console.log(`call_offer sent to ${to} (socket: ${targetSocketId})`);
      socket.emit("call_status", { status: "offer_sent", to });
    } else {
      console.error(`Target not found for call_offer: ${to}`);
      socket.emit("error", { message: "Call recipient not available" });
    }
  });

  socket.on("call_answer", (data) => {
    const { to, answer } = data;
    const targetSocketId = getTargetSocketId(to);
    console.log(`call_answer received from ${user.id} (socket: ${socket.id}) to ${to}`);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_answer", {
        from: user.id,
        answer,
      });
      console.log(`call_answer sent to ${to} (socket: ${targetSocketId})`);
      socket.emit("call_status", { status: "answer_sent", to });
    } else {
      console.error(`Target not found for call_answer: ${to}`);
      socket.emit("error", { message: "Call recipient not available" });
    }
  });

  socket.on("call_candidate", (data) => {
    const { to, candidate } = data;
    const targetSocketId = getTargetSocketId(to);
    console.log(`call_candidate received from ${user.id} (socket: ${socket.id}) to ${to}`);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_candidate", {
        from: user.id,
        candidate,
      });
      console.log(`call_candidate sent to ${to} (socket: ${targetSocketId})`);
    } else {
      console.error(`Target not found for call_candidate: ${to}`);
      socket.emit("error", { message: "Call recipient not available" });
    }
  });

  socket.on("call_reject", (data) => {
    const { to } = data;
    const targetSocketId = getTargetSocketId(to);
    console.log(`call_reject received from ${user.id} (socket: ${socket.id}) to ${to}`);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_reject", { from: user.id });
      console.log(`call_reject sent to ${to} (socket: ${targetSocketId})`);
      socket.emit("call_status", { status: "reject_sent", to });
    } else {
      console.error(`Target not found for call_reject: ${to}`);
      socket.emit("error", { message: "Call recipient not available" });
    }
  });

  socket.on("call_end", (data) => {
    const { to } = data;
    const targetSocketId = getTargetSocketId(to);
    console.log(`call_end received from ${user.id} (socket: ${socket.id}) to ${to}`);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_end", { from: user.id });
      console.log(`call_end sent to ${to} (socket: ${targetSocketId})`);
      socket.emit("call_status", { status: "end_sent", to });
    } else {
      console.error(`Target not found for call_end: ${to}`);
      socket.emit("error", { message: "Call recipient not available" });
    }
    socket.emit("call_end", { from: user.id });
  });

  socket.on("disconnect", () => {
    console.log(`${user.role} disconnected: ${user.username || user.name || user.id} (socket: ${socket.id})`);
    if (user.role === "client") {
      delete clientsMap[user.id];
      if (adminSocket) {
        adminSocket.emit("update_client_list", Object.values(clientsMap));
      }
    } else if (user.role === "admin") {
      adminSocket = null;
      isAdminOnline = false;
      io.emit("admin_status", { online: false });
    }
  });
});

/* === Database Interaction === */

async function saveMessage(sender, recipient, message) {
  try {
    const result = await pool.query(
      "INSERT INTO messages (sender, recipient, message, timestamp, read) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, false) RETURNING *",
      [sender, recipient, message]
    );
    const savedMessage = result.rows[0];
    console.log("Message saved to database:", savedMessage);
    return savedMessage;
  } catch (err) {
    console.error("Error saving message:", err.message);
    throw err;
  }
}

/* === Start Server === */

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});