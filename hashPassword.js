const bcrypt = require('bcrypt');

const password = 'JesusLovesMeIn2025@54321';  // Remplacez par le mot de passe de votre choix
const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
  if (err) {
    console.error('Erreur lors du hachage du mot de passe:', err);
  } else {
    console.log('Mot de passe haché:', hashedPassword);
  }
});
