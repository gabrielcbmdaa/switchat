// /models/Message.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    chatId: {
        type: String, // O mongoose.Schema.Types.ObjectId si usas un modelo de Chats
        required: true
    },
    sender: {
        type: String,
        enum: ['user', 'ai'], // 🚨 Esto es genial: Mongoose rechazará cualquier cosa que no sea uno de estos dos
        required: true
    },
    content: {
        type: String,
        required: true
    },
    model: {
        type: String // Solo relevante para mensajes sender: 'ai'
    },
    createdAt: {
        type: Date,
        default: Date.now // 🕒 Si no le pasamos fecha, MongoDB le pone la hora actual automáticamente
    }
});

module.exports = mongoose.model('Message', MessageSchema);