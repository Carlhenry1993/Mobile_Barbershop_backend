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

// Optionally include security middleware (e.g., helmet)
// const helmet = require("helmet");
// app.use(helmet());

// Middleware
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Routes
app.use("/api/announcements", announcementRoutes);
app.use("/api/auth", authRoutes);
app.use("/send-email", bookingRoutes);
app.use("/api/contact", contactRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: "Route non trouvée" });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Une erreur interne est survenue." });
});

// Socket.IO Setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"],
  },
});

// In-memory storage for connected clients and admin socket
const clientsMap = {};
let adminSocket = null;

// Socket.IO Authentication Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentification manquante"));

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    if (user.role !== "admin" && user.role !== "client") {
      return next(new Error("Rôle utilisateur invalide"));
    }
    socket.user = user;
    next();
  } catch (err) {
    console.error("Erreur d'authentification JWT:", err.message);
    next(new Error("Token invalide"));
  }
});

// Socket.IO Connection Handler
io.on("connection", (socket) => {
  const user = socket.user;
  console.log(`${user.role} connecté : ${user.username || user.id}`);

  if (user.role === "admin") {
    if (adminSocket) {
      console.log("Un autre administrateur est déjà connecté.");
      return socket.disconnect();
    }
    adminSocket = socket;
    // Inform admin of currently connected clients
    socket.emit("update_client_list", Object.values(clientsMap));

    // Admin sends an announcement
    socket.on("send_announcement", async ({ title, content }) => {
      if (!title || !content) {
        return socket.emit("error", { message: "Titre ou contenu manquant." });
      }
      try {
        const result = await pool.query(
          "INSERT INTO announcements (title, content, created_at) VALUES ($1, $2, NOW()) RETURNING *",
          [title, content]
        );
        io.emit("new_announcement", result.rows[0]);
      } catch (err) {
        console.error("Erreur lors de l'ajout de l'annonce :", err.message);
        socket.emit("error", { message: "Erreur lors de l'ajout de l'annonce." });
      }
    });
  } else if (user.role === "client") {
    // Register client in the clientsMap
    clientsMap[user.id] = { id: user.id, name: user.username, socketId: socket.id };
    if (adminSocket) {
      adminSocket.emit("update_client_list", Object.values(clientsMap));
    }

    // Client sends a message to the admin
    socket.on("send_message_to_admin", async ({ message }) => {
      if (!message) {
        return socket.emit("error", { message: "Le message est vide." });
      }
      if (adminSocket) {
        try {
          // Save the message to the database
          const savedMessage = await saveMessage(user.id, "admin", message);
          // Notify the admin
          adminSocket.emit("new_message", {
            sender: user.username || `Client ${user.id}`,
            message: savedMessage.message,
          });
        } catch (err) {
          console.error("Erreur lors de l'enregistrement du message :", err.message);
          socket.emit("error", { message: "Erreur lors de l'enregistrement du message." });
        }
      } else {
        socket.emit("error", { message: "Aucun administrateur connecté." });
      }
    });
  }

  // Admin sends a message to a client
  socket.on("send_message_to_client", async ({ clientId, message }) => {
    if (!clientId || !message) {
      return socket.emit("error", { message: "ID client ou message manquant." });
    }
    const clientSocketId = clientsMap[clientId]?.socketId;
    if (clientSocketId) {
      try {
        // Save the message to the database
        const savedMessage = await saveMessage("admin", clientId, message);
        // Notify the client
        io.to(clientSocketId).emit("new_message", {
          sender: "admin",
          message: savedMessage.message,
        });
      } catch (err) {
        console.error("Erreur lors de l'envoi du message à un client :", err.message);
        socket.emit("error", { message: "Erreur lors de l'envoi du message." });
      }
    } else {
      console.error(`Client non trouvé ou déconnecté : ${clientId}`);
      socket.emit("error", { message: "Client non trouvé ou déconnecté." });
    }
  });

  // WebRTC Signaling events for real-time communication
  socket.on("offer", (data) => {
    socket.to(data.target).emit("offer", data);
  });
  socket.on("answer", (data) => {
    socket.to(data.target).emit("answer", data);
  });
  socket.on("candidate", (data) => {
    socket.to(data.target).emit("candidate", data);
  });

  // Handle disconnection: update clientsMap and notify admin if needed
  socket.on("disconnect", () => {
    console.log(`${user.role} déconnecté : ${user.username || user.id}`);
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

// Helper: Save Message to Database
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
    console.error("Erreur lors de la sauvegarde du message :", err.message);
    throw err;
  }
}

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Serveur en cours d'exécution sur http://localhost:${PORT}`);
});
