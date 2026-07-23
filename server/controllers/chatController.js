const Message = require('../models/Message');
const Chat = require('../models/Chat');
const { fetchFromProvider } = require('../services/providerService');

exports.createMessage = async (req, res) => {
    try {
        // 1. Extraemos los datos que vienen del frontend (incluyendo la clave de API efímera si fue enviada)
        const { chatId } = req.params;
        const { content, messages, model, provider, reasoningLevel, thinkingBudget } = req.body;
        const userApiKey = req.headers['x-user-api-key'] || req.body.userApiKey;

        // Validación rápida
        if (!content || content.trim() === '') {
            return res.status(400).json({ message: 'El contenido del mensaje es obligatorio' });
        }

        // 2. GUARDAR EL MENSAJE DEL USUARIO en MongoDB Atlas
        const userMessage = new Message({
            chatId,
            sender: 'user',
            content: content
        });
        await userMessage.save();

        // 3. OBTENER RESPUESTA DEL PROVEEDOR (Google, Anthropic, OpenAI, LM Studio, Ollama)
        const { text: responseText } = await fetchFromProvider({
            model,
            provider,
            messagesHistory: messages,
            reasoningLevel,
            thinkingBudget,
            userApiKey
        });

        // 4. GUARDAR LA RESPUESTA DE LA AI en MongoDB Atlas
        const aiMessage = new Message({
            chatId,
            sender: 'ai',
            content: responseText
        });
        await aiMessage.save();

        // 5. RESPONDER AL FRONTEND
        return res.status(201).json({
            text: responseText,
            userMessageId: userMessage._id,
            aiMessageId: aiMessage._id
        });

    } catch (error) {
        // Diferenciamos errores conocidos de validación / negocio de errores inesperados de servidor
        const isKnownError = error.message && error.message.startsWith('⚠️');

        if (isKnownError) {
            console.warn(`⚠️ [chatController] ${error.message}`);
            return res.status(400).json({
                message: error.message,
                error: error.message
            });
        }

        // Si el error provino de providerService (error formateado de la API externa)
        if (error.apiErrorMessage) {
            console.warn(`⚠️ [chatController] Error ${error.status} de ${error.provider}: ${error.apiErrorMessage}`);
            const errorMap = {
                401: `🔑 Invalid or expired API Key for ${error.provider}. Check your configuration.`,
                403: `🚫 Access denied by ${error.provider}. Your API Key does not have permissions to use the model "${error.model}".`,
                404: `❓ The model "${error.model}" does not exist or is unavailable in ${error.provider}.`,
                429: `⏳ Too many requests to ${error.provider}. You have reached the rate limit. Please wait a moment and try again.`,
                503: `🔥 The model "${error.model}" is experiencing high demand right now. Try again in a few seconds or try another model.`,
            };

            const userMessage = errorMap[error.status] || `Error ${error.status} de ${error.provider}: ${error.apiErrorMessage}`;

            return res.status(error.status).json({
                message: userMessage,
                error: error.apiErrorMessage,
                code: error.status,
                provider: error.provider,
                model: error.model
            });
        }

        const isNetworkError = error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.cause?.code === 'ECONNREFUSED';

        if (isNetworkError) {
            console.warn(`🔌 [chatController] No se pudo conectar con el servidor local de IA (${error.message}).`);
            return res.status(503).json({
                message: '🔌 No se pudo conectar con el servidor local de IA. Asegúrate de que LM Studio u Ollama estén ejecutándose.',
                error: error.message
            });
        }

        // Únicamente si es un error 500 no controlado imprimimos la traza completa
        console.error("❌ Error inesperado en chatController:", error);
        res.status(500).json({
            message: 'Error interno del servidor. Intenta de nuevo.',
            error: error.message
        });
    }
};

// 📂 OBTENER TODOS LOS CHATS (Sin los mensajes para permitir carga progresiva)
exports.getChats = async (req, res) => {
    try {
        // 1. Buscamos todos los chats del usuario
        const chats = await Chat.find({ userId: req.user.id }).sort({ createdAt: -1 });

        // 2. Devolvemos la lista de chats con arreglo de mensajes vacío para que el frontend los cargue bajo demanda
        const formattedChats = chats.map(chat => ({
            ...chat.toObject(),
            messages: []
        }));

        res.json(formattedChats);

    } catch (error) {
        console.error("❌ Error en getChats:", error);
        res.status(500).json({ message: 'Error al leer la base de datos', error: error.message });
    }
};

// 📂 OBTENER MENSAJES PAGINADOS DE UN CHAT ESPECÍFICO
exports.getMessages = async (req, res) => {
    try {
        const { chatId } = req.params;
        const limit = parseInt(req.query.limit) || 6;
        const before = req.query.before; // Fecha ISO

        const query = { chatId };
        if (before) {
            query.createdAt = { $lt: new Date(before) };
        }

        // Buscamos los mensajes más recientes ordenados descendente
        const dbMessages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(limit);

        // Traducimos el formato de Mongoose al frontend (role/parts) y los revertimos
        // para que queden ordenados cronológicamente (más antiguo al más nuevo)
        const formattedMessages = dbMessages.map(msg => ({
            _id: msg._id,
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
            createdAt: msg.createdAt
        })).reverse();

        res.json(formattedMessages);

    } catch (error) {
        console.error("❌ Error en getMessages:", error);
        res.status(500).json({ message: 'Error al obtener los mensajes de la base de datos', error: error.message });
    }
};

// 🔄 1. SINCRONIZAR CHAT (Crear o Actualizar)
exports.syncChat = async (req, res) => {
    try {
        const updatedChat = req.body;
        delete updatedChat._id; // Evitamos romper MongoDB

        updatedChat.userId = req.user.id; // Aseguramos que el chat quede asociado al usuario correcto

        // Mongoose buscará por el 'id' del chat y lo actualizará, si no existe lo crea (upsert)
        const chat = await Chat.findOneAndUpdate(
            { id: updatedChat.id },
            { $set: updatedChat },
            { upsert: true, returnDocument: 'after' }
        );

        res.json({ message: 'Chat synchronized successfully', chat });
    } catch (error) {
        console.error("❌ Error en syncChat:", error);
        res.status(500).json({ message: 'Error al guardar el chat en la base de datos', error: error.message });
    }
};

// 🗑️ 2. ELIMINAR CHAT (¡Con truco profesional!)
exports.deleteChat = async (req, res) => {
    try {
        const chatIdToDelete = req.params.id;

        const chat = await Chat.findOne({ id: chatIdToDelete, userId: req.user.id });

        // Primero borramos el chat
        await Chat.deleteOne({ id: chatIdToDelete });

        // 🔥 PRO-TIP: También borramos todos los mensajes que pertenecían a ese chat
        // así evitamos dejar datos "fantasma" ocupando espacio en MongoDB Atlas
        await Message.deleteMany({ chatId: chatIdToDelete });

        res.json({ message: 'Chat and its messages deleted successfully' });
    } catch (error) {
        console.error("❌ Error en deleteChat:", error);
        res.status(500).json({ message: 'Error al eliminar el chat', error: error.message });
    }
};

// 🗑️ 3. ELIMINAR UN MENSAJE INDIVIDUAL
exports.deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;

        const deletedMessage = await Message.findByIdAndDelete(messageId);

        if (!deletedMessage) {
            return res.status(404).json({ message: 'Mensaje no encontrado' });
        }

        res.json({ message: 'Message deleted successfully' });
    } catch (error) {
        console.error("❌ Error en deleteMessage:", error);
        res.status(500).json({ message: 'Error al eliminar el mensaje', error: error.message });
    }
};