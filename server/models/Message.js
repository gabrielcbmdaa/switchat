// /models/Message.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    chatId: {
        type: String, // Chat.id, the client-generated string, not the Chat _id
        required: true
    },
    sender: {
        type: String,
        enum: ['user', 'ai'], // Mongoose rejects anything that is not one of these two
        required: true
    },
    content: {
        type: String,
        required: true
    },
    model: {
        type: String // Only meaningful for sender: 'ai' messages
    },
    createdAt: {
        type: Date,
        default: Date.now // Set by the server when the caller does not provide one
    }
});

// getMessages filters by chatId and sorts by { createdAt: -1, _id: -1 }, paginating with a
// `before` cursor. Without an index Mongo scans the entire collection and sorts in memory,
// so reading one short chat costs the same as reading every message ever sent, and the sort
// fails outright once it outgrows its memory budget.
//
// The three keys have to mirror the sort exactly. An index on chatId alone, or on
// chatId + createdAt, narrows the scan but still leaves the in-memory sort in place: the
// _id tiebreaker is part of the order being asked for.
//
// countDocuments, deleteMany and the chatId half of findOneAndDelete ride on the same index.
MessageSchema.index({ chatId: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model('Message', MessageSchema);