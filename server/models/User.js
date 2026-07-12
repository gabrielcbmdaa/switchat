const mongoose = require('mongoose');

// 1. Definir el molde (Esquema)
const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'El correo electrónico es obligatorio'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'La contraseña es obligatoria'],
    minlength: [6, 'La contraseña debe tener al menos 6 caracteres']
  }
}, {
  // 2. Opciones de configuración del molde
  timestamps: true 
});

// 3. Exportar el modelo listo para usar
module.exports = mongoose.model('User', UserSchema);