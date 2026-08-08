const mongoose = require('mongoose');

// 1. Definir el molde (Esquema)
const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'The email address is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'The password is required'],
    minlength: [6, 'The password must be at least 6 characters long']
  },
  acceptedTermsAt: {
    type: Date,
    default: null
  }
}, {
  // 2. Opciones de configuración del molde
  timestamps: true 
});

// 3. Exportar el modelo listo para usar
module.exports = mongoose.model('User', UserSchema);