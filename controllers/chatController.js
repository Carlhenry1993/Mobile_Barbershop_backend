const { Message } = require("../models"); // Assurez-vous que le modèle Message est correctement importé

// Fonction pour sauvegarder un message dans la base de données
const sendMessage = async (data) => {
  try {
    const newMessage = await Message.create(data);
    return newMessage;
  } catch (error) {
    console.error("Erreur lors de la sauvegarde du message dans la base de données :", error);
    throw new Error("Impossible d'envoyer le message.");
  }
};

// Fonction pour configurer les écouteurs de chat avec Socket.IO
const setupChatListeners = (io) => {
  const clientsMap = {}; // Map pour suivre les clients connectés
  let adminSocket = null; // Référence au socket de l'administrateur

  io.on("connection", (socket) => {
    console.log("Nouvelle connexion WebSocket : ", socket.id);

    // Identification de l'utilisateur connecté
    socket.on("identify", (user) => {
      if (user.role === "admin") {
        adminSocket = socket;
        console.log("Administrateur connecté :", socket.id);
      } else if (user.role === "client") {
        clientsMap[user.id] = socket.id;
        console.log(`Client connecté : ${user.id}`);
      }
    });

    // Lorsqu'un client envoie un message à l'administrateur
    socket.on("messageToAdmin", async (data) => {
      try {
        const savedMessage = await sendMessage({
          sender: data.clientId,
          recipient: "admin",
          message: data.message,
          is_read: false,
        });

        if (adminSocket) {
          adminSocket.emit("newMessageForAdmin", {
            message: savedMessage.message,
            senderId: savedMessage.sender,
          });
        } else {
          console.error("Administrateur non connecté.");
        }
      } catch (error) {
        console.error("Erreur lors de l'envoi d'un message à l'administrateur :", error);
      }
    });

    // Lorsqu'un administrateur envoie un message à un client
    socket.on("messageToClient", async (data) => {
      try {
        const savedMessage = await sendMessage({
          sender: "admin",
          recipient: data.clientId,
          message: data.message,
          is_read: false,
        });

        const clientSocketId = clientsMap[data.clientId];
        if (clientSocketId) {
          io.to(clientSocketId).emit("newMessageForClient", {
            message: savedMessage.message,
            senderId: savedMessage.sender,
          });
        } else {
          console.error(`Client non trouvé ou déconnecté : ${data.clientId}`);
        }
      } catch (error) {
        console.error("Erreur lors de l'envoi d'un message au client :", error);
      }
    });

    // Gestion de la déconnexion
    socket.on("disconnect", () => {
      console.log(`Socket déconnecté : ${socket.id}`);
      if (socket === adminSocket) {
        console.log("Administrateur déconnecté.");
        adminSocket = null;
      } else {
        const clientId = Object.keys(clientsMap).find((id) => clientsMap[id] === socket.id);
        if (clientId) {
          delete clientsMap[clientId];
          console.log(`Client déconnecté : ${clientId}`);
        }
      }
    });
  });
};

module.exports = { sendMessage, setupChatListeners };
