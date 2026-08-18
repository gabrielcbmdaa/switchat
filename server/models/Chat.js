const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // Tu ID tipo chat-1781...
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true}, // Para saber de quién es el chat
    draft: { type: String, default: '' },
    title: { type: String, default: 'New Chat' },
    systemPrompt: { type: String, default: '' },
    systemPromptEnabled: { type: Boolean, default: true },
    notesEnabled: { type: Boolean, default: false },
    notes: { type: String, default: '' },
    model: { type: String, default: '' },
    reasoningLevel: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    // When the chat last saw a message, so the client can order the list by activity instead
    // of by birth date. Deliberately WITHOUT a default: its absence is the signal for "chat
    // older than this field", which is what makes the client fall back to createdAt. A
    // default would erase that distinction and every legacy chat would claim to be fresh.
    //
    // The server owns it. Only createMessage, the migration in syncChat and deleteMessage
    // write it — see the guard in syncChat for why the client is not allowed to.
    lastMessageAt: { type: Date }
});

module.exports = mongoose.model('Chat', ChatSchema);