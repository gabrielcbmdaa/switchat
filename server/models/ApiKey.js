const mongoose = require('mongoose');

// Una fila por API key guardada. El usuario puede tener varias del mismo proveedor
// (la lista de AccountView) y como mucho una marcada como activa.
const ApiKeySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    provider: {
        type: String,
        required: [true, 'El proveedor es obligatorio'],
        lowercase: true,
        trim: true
    },
    // Cifrada con AES-256-GCM (ver services/encryptionService.js), formato v1:iv:tag:ct.
    // Nunca se guarda en claro: el servidor la custodia, no la usa.
    key: {
        type: String,
        required: [true, 'La API key es obligatoria']
    },
    isActive: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Todas las consultas filtran por usuario
ApiKeySchema.index({ userId: 1 });

// Como mucho una key activa por usuario y proveedor. El índice es PARCIAL a propósito:
// las inactivas no compiten entre sí, así que se pueden guardar varias del mismo
// proveedor. Un índice único normal sobre {userId, provider} lo impediría.
ApiKeySchema.index(
    { userId: 1, provider: 1 },
    { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model('ApiKey', ApiKeySchema);
