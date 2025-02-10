require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const http = require("http");
const { Server } = require("socket.io");
const pool = require("./db/pool");

// Import des routes
const announcementRoutes = require("./routes/announcementRoutes");
const authRoutes = require("./routes/authRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const contactRoutes = require("./routes/contactRoutes");

const app = express();

// Configuration CORS
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

// Route de base pour le health-check
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

// Montage des routes
app.use("/api/announcements", announcementRoutes);
app.use("/api/auth", authRoutes);
app.use("/send-email", bookingRoutes);
app.use("/api/contact", contactRoutes);

// Gestion des routes non trouvées
app.use((req, res) => {
  res.status(404).json({ error: "Route non trouvée" });
});

// Gestion globale des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Une erreur interne est survenue." });
});

// Création du serveur HTTP et configuration de Socket.IO
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

// Stockage en mémoire des clients connectés et du socket admin
const clientsMap = {};
let adminSocket = null;

// Middleware d'authentification pour Socket.IO
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

// Fonction d'obtention du socket cible selon l'ID ou "admin"
const getTargetSocketId = (target) => {
  if (target === "admin") {
    return adminSocket ? adminSocket.id : null;
  } else {
    return clientsMap[target] ? clientsMap[target].socketId : null;
  }
};

// Gestion de la connexion Socket.IO
io.on("connection", (socket) => {
  const user = socket.user;
  console.log(`${user.role} connecté : ${user.username || user.id}`);

  if (user.role === "admin") {
    if (adminSocket) {
      console.log("Un autre administrateur est déjà connecté.");
      return socket.disconnect();
    }
    adminSocket = socket;
    // À la connexion de l'admin, envoyer la liste courante des clients
    socket.emit("update_client_list", Object.values(clientsMap));

    // L'administrateur peut envoyer une annonce
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
    // Enregistrement du client avec un nom par défaut si user.username est vide
    clientsMap[user.id] = { id: user.id, name: user.username || `Client ${user.id}`, socketId: socket.id };
    if (adminSocket) {
      adminSocket.emit("update_client_list", Object.values(clientsMap));
    }

    // Le client envoie un message à l'administrateur
    socket.on("send_message_to_admin", async ({ message }) => {
      if (!message) {
        return socket.emit("error", { message: "Le message est vide." });
      }
      if (adminSocket) {
        try {
          const savedMessage = await saveMessage(user.id, "admin", message);
          // Envoyer le message uniquement à l'admin avec l'ID de l'expéditeur
          adminSocket.emit("new_message", {
            sender: user.username || `Client ${user.id}`,
            senderId: user.id,
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

  // L'administrateur peut envoyer un message à un client
  socket.on("send_message_to_client", async ({ clientId, message }) => {
    if (user.role !== "admin") {
      return socket.emit("error", { message: "Seul l'administrateur peut envoyer des messages aux clients." });
    }
    if (!clientId || !message) {
      return socket.emit("error", { message: "ID client ou message manquant." });
    }
    const clientSocketId = clientsMap[clientId]?.socketId;
    if (clientSocketId) {
      try {
        const savedMessage = await saveMessage("admin", clientId, message);
        // Envoyer le message à l'utilisateur ciblé avec senderId "admin"
        io.to(clientSocketId).emit("new_message", {
          sender: "admin",
          senderId: "admin",
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

  // --- Événements de signalisation WebRTC pour appels vocaux/vidéo ---
  socket.on("call_offer", (data) => {
    const targetSocketId = getTargetSocketId(data.to);
    console.log(`Appel OFFER de ${user.id} vers ${data.to} (socket cible: ${targetSocketId})`);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_offer", {
        from: user.id,
        callType: data.callType,
        offer: data.offer,
      });
    } else {
      socket.emit("error", { message: "Destinataire de l'appel non disponible." });
    }
  });

  socket.on("call_answer", (data) => {
    const targetSocketId = getTargetSocketId(data.to);
    console.log(`Appel ANSWER de ${user.id} vers ${data.to} (socket cible: ${targetSocketId})`);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_answer", {
        from: user.id,
        answer: data.answer,
      });
    } else {
      socket.emit("error", { message: "Destinataire de l'appel non disponible." });
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
      socket.emit("error", { message: "Destinataire de l'appel non disponible." });
    }
  });

  socket.on("call_reject", (data) => {
    const targetSocketId = getTargetSocketId(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_reject", { from: user.id });
    } else {
      socket.emit("error", { message: "Destinataire de l'appel non disponible." });
    }
  });

  socket.on("call_end", (data) => {
    const targetSocketId = getTargetSocketId(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call_end", { from: user.id });
    } else {
      socket.emit("error", { message: "Destinataire de l'appel non disponible." });
    }
  });

  // Déconnexion : mise à jour de la liste des clients et notification à l'admin
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

// Fonction d'enregistrement d'un message dans la base de données
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

// Démarrage du serveur
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Serveur en cours d'exécution sur http://localhost:${PORT}`);
});
