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

const setupChatListeners = (io) => {
  // Code éventuel pour initialiser les écouteurs si nécessaire
};

module.exports = { sendMessage, setupChatListeners };
