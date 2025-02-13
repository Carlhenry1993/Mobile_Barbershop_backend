require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const http = require("http");
const { Server } = require("socket.io");
const pool = require("./db/pool");

// Import routes
const announcementRoutes = require("./routes/announcementRoutes");
const authRoutes = require("./routes/authRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const contactRoutes = require("./routes/contactRoutes");

const app = express();

// CORS configuration
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://mobile-barbershop-frontend.vercel.app",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.options("*", cors());

// Base route for health check
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

// Mount routes
app.use("/api/announcements", announcementRoutes);
app.use("/api/auth", authRoutes);
app.use("/send-email", bookingRoutes);
app.use("/api/contact", contactRoutes);

// Handle 404 routes
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

// Create HTTP server and configure Socket.IO
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

// In-memory storage for connected clients and admin
const clientsMap = {};
let adminSocket = null;

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication missing"));

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    if (user.role !== "admin" && user.role !== "client") {
      return next(new Error("Invalid user role"));
    }
    socket.user = user;
    next();
  } catch (err) {
    console.error("JWT authentication error:", err.message);
    next(new Error("Invalid token"));
  }
});

// Helper function to get target socket ID
const getTargetSocketId = (target) => {
  if (target === "admin") {
    return adminSocket ? adminSocket.id : null;
  } else {
    return clientsMap[target] ? clientsMap[target].socketId : null;
  }
};

// Socket.IO connection handler
io.on("connection", (socket) => {
  const user = socket.user;
  console.log(`${user.role} connected: ${user.username || user.id}`);

  if (user.role === "admin") {
    if (adminSocket) {
      console.log("Another admin is already connected.");
      return socket.disconnect();
    }
    adminSocket = socket;
    // Send current client list to admin
    socket.emit("update_client_list", Object.values(clientsMap));

    // Admin sends an announcement
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
    // Register client with a default name if username is empty
    clientsMap[user.id] = { id: user.id, name: user.username || `Client ${user.id}`, socketId: socket.id };
    if (adminSocket) {
      adminSocket.emit("update_client_list", Object.values(clientsMap));
    }

    // Client sends a message to admin
    socket.on("send_message_to_admin", async ({ message }) => {
      if (!message) {
        return socket.emit("error", { message: "Message is empty" });
      }
      if (adminSocket) {
        try {
          const savedMessage = await saveMessage(user.id, "admin", message);
          adminSocket.emit("new_message", {
            sender: user.username || `Client ${user.id}`,
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

  // Admin sends a message to a client
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

  // WebRTC signaling events
  socket.on("call_offer", (data) => {
    const targetSocketId = getTargetSocketId(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_offer", {
        from: user.id,
        callType: data.callType,
        offer: data.offer,
      });
    } else {
      socket.emit("error", { message: "Call recipient not available" });
    }
  });

  socket.on("call_answer", (data) => {
    const targetSocketId = getTargetSocketId(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_answer", {
        from: user.id,
        answer: data.answer,
      });
    } else {
      socket.emit("error", { message: "Call recipient not available" });
    }
  });

  socket.on("call_candidate", (data) => {
    const targetSocketId = getTargetSocketId(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_candidate", {
        from: user.id,
        candidate: data.candidate,
      });
    } else {
      socket.emit("error", { message: "Call recipient not available" });
    }
  });

  socket.on("call_reject", (data) => {
    const targetSocketId = getTargetSocketId(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_reject", { from: user.id });
    } else {
      socket.emit("error", { message: "Call recipient not available" });
    }
  });

  socket.on("call_end", (data) => {
    const targetSocketId = getTargetSocketId(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_end", { from: user.id });
    } else {
      socket.emit("error", { message: "Call recipient not available" });
    }
  });

  // Handle client or admin disconnection
  socket.on("disconnect", () => {
    console.log(`${user.role} disconnected: ${user.username || user.id}`);
    if (user.role === "client") {
      delete clientsMap[user.id];
      if (adminSocket) {
        adminSocket.emit("update_client_list", Object.values(clientsMap));
      }
    } else if (user.role === "admin") {
      adminSocket = null;
      io.emit("admin_disconnected");
    }
  });
});

// Function to save a message to the database
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

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});