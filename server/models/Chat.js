const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // Tu ID tipo chat-1781...
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true}, // Para saber de quién es el chat
    draft: { type: String, default: '' },
    title: { type: String, default: 'New Chat' },
    systemPrompt: { type: String, default: '' },
    systemPromptEnabled: { type: Boolean, default: true },
    notesEnabled: { type: Boolean, default: false },
    model: { type: String, default: '' },
    reasoningLevel: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Chat', ChatSchema);