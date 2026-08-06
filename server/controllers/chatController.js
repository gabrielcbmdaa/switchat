const Message = require('../models/Message');
const Chat = require('../models/Chat');
const { fetchFromProvider } = require('../services/providerService');

// 💾 GUARDAR UN MENSAJE SUELTO
// Escritura pura: el cliente llama al proveedor y nos manda el resultado. El cliente
// hace dos peticiones por intercambio (el prompt antes de generar, la respuesta después),
// así que este handler no sabe nada de conversaciones ni de modelos.
exports.createMessage = async (req, res) => {
    try {
        const { chatId } = req.params;
        const { sender, content, model } = req.body;

        // Guardia de forma. Una pestaña abierta antes del despliegue sigue mandando el body
        // viejo (sin `sender`) y esperando un `text` de vuelta: sin este 400 recibiría un 201,
        // leería `undefined` y guardaría una respuesta vacía. Mejor un error que se arregla
        // recargando que una conversación corrompida en silencio.
        if (sender !== 'user' && sender !== 'ai') {
            return res.status(400).json({ message: 'El campo sender debe ser "user" o "ai"' });
        }

        if (!content || content.trim() === '') {
            return res.status(400).json({ message: 'El contenido del mensaje es obligatorio' });
        }

        // Message no guarda userId, así que la propiedad se comprueba contra el chat padre.
        // Sin esto el endpoint permitiría escribir en la conversación de cualquiera con solo
        // acertar un chatId, y de paso nos da el 404 natural para chats que ya no existen.
        const chatExists = await Chat.exists({ id: chatId, userId: req.user.id });
        if (!chatExists) {
            return res.status(404).json({ message: 'Chat no encontrado' });
        }

        // createdAt lo pone el servidor (default del schema) y se devuelve: getMessages ordena
        // por él, y aceptar el reloj del cliente desordenaría la conversación al recargar.
        const message = new Message({
            chatId,
            sender,
            content,
            ...(model ? { model } : {})
        });
        await message.save();

        return res.status(201).json({
            _id: message._id,
            createdAt: message.createdAt
        });

    } catch (error) {
        console.error("❌ Error en createMessage:", error);
        res.status(500).json({ message: 'Error al guardar el mensaje', error: error.message });
    }
};

// ✨ GENERAR UN TÍTULO PARA EL CHAT
// Proxy puro hacia el proveedor: no toca la colección Message ni el documento Chat.
// El cliente arma el prompt (fuente única) y guarda el título con el sync habitual.
exports.generateTitle = async (req, res) => {
    try {
        const { messages, model, provider } = req.body;
        const userApiKey = req.headers['x-user-api-key'] || req.body.userApiKey;

        if (!Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ message: 'Se requiere el historial para generar el título' });
        }

        // Sin thinking: titular es una tarea corta y no debe gastar presupuesto de razonamiento
        const { text } = await fetchFromProvider({
            model,
            provider,
            messagesHistory: messages,
            reasoningLevel: 'off',
            userApiKey
        });

        return res.json({ text });

    } catch (error) {
        // El título es un extra: no rompemos el chat por él, solo lo reportamos
        console.warn(`⚠️ [chatController] No se pudo generar el título: ${error.apiErrorMessage || error.message}`);
        return res.status(error.status || 500).json({ message: 'No se pudo generar el título del chat' });
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
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit);

        // Traducimos el formato de Mongoose al frontend (role/parts) y los revertimos
        // para que queden ordenados cronológicamente (más antiguo al más nuevo)
        const formattedMessages = dbMessages.map(msg => ({
            _id: msg._id,
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
            createdAt: msg.createdAt,
            model: msg.model
        })).reverse();

        res.json(formattedMessages);

    } catch (error) {
        console.error("❌ Error en getMessages:", error);
        res.status(500).json({ message: 'Error al obtener los mensajes de la base de datos', error: error.message });
    }
};

// 🔄 1. SINCRONIZAR CHAT (Crear o Actualizar)
// Si el body trae messages[] y el chat aún no tiene mensajes en Message, los siembra una sola vez.
exports.syncChat = async (req, res) => {
    try {
        const { messages, ...chatFields } = req.body;
        delete chatFields._id; // Evitamos romper MongoDB / schema Chat (messages no pertenece aquí)

        chatFields.userId = req.user.id;

        const chat = await Chat.findOneAndUpdate(
            { id: chatFields.id, userId: req.user.id },
            { $set: chatFields },
            { upsert: true, returnDocument: 'after' }
        );

        if (Array.isArray(messages) && messages.length > 0) {
            const existingCount = await Message.countDocuments({ chatId: chatFields.id });
            if (existingCount === 0) {
                // Timestamps escalonados: insertMany en el mismo ms desordena al ordenar por createdAt.
                const baseTime = Date.now() - messages.length * 1000;
                const docs = messages
                    .map((msg, index) => {
                        const text = msg?.parts?.[0]?.text;
                        if (!text || typeof text !== 'string') return null;
                        const sender = msg.role === 'user' ? 'user' : 'ai';
                        const createdAt = msg.createdAt
                            ? new Date(msg.createdAt)
                            : new Date(baseTime + index * 1000);
                        return {
                            chatId: chatFields.id,
                            sender,
                            content: text,
                            createdAt,
                            ...(msg.model ? { model: msg.model } : {})
                        };
                    })
                    .filter(Boolean);

                if (docs.length > 0) {
                    await Message.insertMany(docs);
                }
            }
        }

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