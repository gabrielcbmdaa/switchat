const Message = require('../models/Message');
const Chat = require('../models/Chat');

exports.createMessage = async (req, res) => {
    try {
        // 1. Extraemos los datos que vienen del frontend
        const { chatId } = req.params;
        const { content, messages, model, provider } = req.body;

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

        //MODEL AND PROVIDER IN LOWER CASE
        const modelLowerCase = model.toLowerCase();
        const providerLowerCase = provider.toLowerCase();

        // 3. SELECCIÓN DINÁMICA DE PROVEEDOR (OpenAI, Gemini o Local LM Studio)
        let apiUrl = "";
        let apiKey = "";

        switch (providerLowerCase) {
            case 'openai':
                apiUrl = 'https://api.openai.com/v1/chat/completions';
                apiKey = process.env.OPENAI_API_KEY;
                if (!apiKey) {
                    throw new Error("⚠️ API Key de OpenAI no fue encontrada.");
                }
                break;
            case 'google':
                apiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
                apiKey = process.env.GOOGLE_API_KEY;
                if (!apiKey) {
                    throw new Error("⚠️ API Key de Google no fue encontrada.");
                }
                break;
            case 'lm studio':
                apiUrl = 'http://127.0.0.1:1234/v1/chat/completions';
                apiKey = "lm-studio-key"; // Key dummy requerida por la especificación de OpenAI
                break;
            case 'ollama':
                apiUrl = 'http://127.0.0.1:11434/v1/chat/completions';
                apiKey = "ollama-key"; // Key dummy requerida por la especificación de OpenAI
                break;
            case 'anthropic':
                apiUrl = 'https://api.anthropic.com/v1/chat/completions';
                apiKey = process.env.ANTHROPIC_API_KEY;
                if (!apiKey) {
                    throw new Error("⚠️ API Key de Anthropic no fue encontrada.");
                }
                break;
            default:
                throw new Error(`⚠️ El proveedor de IA "${providerLowerCase}" no está soportado.`);
        }

        console.log(`🚀 Enviando petición a ${providerLowerCase} con modelo: ${modelLowerCase}`);

        // Conversión unificada de mensajes al formato de OpenAI
        const formattedMessages = messages.map(msg => {
            let role = 'user';
            if (msg.role === 'model') role = 'assistant';
            else if (msg.role === 'system') role = 'system';

            const contentText = msg.parts && msg.parts[0] ? msg.parts[0].text : '';
            return {
                role,
                content: contentText
            };
        });

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: modelLowerCase,
                messages: formattedMessages
            })
        });

        // 5. MANEJO ROBUSTO DE ERRORES DE LA API DEL PROVEEDOR
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Detalle del error de la API (${providerLowerCase}):`, errorText);

            // Intentamos parsear el JSON de error del proveedor para extraer el mensaje real
            let apiErrorMessage = errorText;
            try {
                const errorJson = JSON.parse(errorText);
                apiErrorMessage = errorJson.error?.message || errorJson.message || errorText;
            } catch {
                // Si no es JSON, usamos el texto plano tal cual
            }

            // Clasificamos el error por código HTTP y devolvemos un mensaje amigable
            const statusCode = response.status;
            const errorMap = {
                401: `🔑 API Key inválida o expirada para ${providerLowerCase}. Revisa tu clave en Config.`,
                403: `🚫 Acceso denegado por ${providerLowerCase}. Tu API Key no tiene permisos para usar el modelo "${modelLowerCase}".`,
                404: `❓ El modelo "${modelLowerCase}" no existe o no está disponible en ${providerLowerCase}.`,
                429: `⏳ Demasiadas peticiones a ${providerLowerCase}. Has alcanzado el límite de uso. Espera un momento e intenta de nuevo.`,
                503: `🔥 El modelo "${modelLowerCase}" está bajo alta demanda en este momento. Intenta de nuevo en unos segundos o prueba con otro modelo.`,
            };

            const userMessage = errorMap[statusCode]
                || `Error ${statusCode} de ${providerLowerCase}: ${apiErrorMessage}`;

            // Reenviamos el código HTTP real al frontend (no siempre 500)
            return res.status(statusCode >= 500 ? 502 : statusCode).json({
                message: userMessage,
                error: apiErrorMessage,
                code: statusCode,
                provider: providerLowerCase,
                model: modelLowerCase
            });
        }

        const data = await response.json();
        const responseText = data.choices[0].message.content;

        // 6. GUARDAR LA RESPUESTA DE LA AI en MongoDB Atlas
        const aiMessage = new Message({
            chatId,
            sender: 'ai',
            content: responseText
        });
        await aiMessage.save();

        // 7. RESPONDER AL FRONTEND
        res.status(201).json({
            text: responseText,
            userMessageId: userMessage._id,
            aiMessageId: aiMessage._id
        });

    } catch (error) {
        console.error("❌ Error en chatController:", error);

        // Diferenciamos errores conocidos (lanzados intencionalmente) de errores inesperados
        const isKnownError = error.message.startsWith('⚠️');
        const isNetworkError = error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.cause?.code === 'ECONNREFUSED';

        let statusCode = 500;
        let userMessage = 'Error interno del servidor. Intenta de nuevo.';

        if (isKnownError) {
            // Errores lanzados por nosotros (API key faltante, proveedor no soportado)
            statusCode = 400;
            userMessage = error.message;
        } else if (isNetworkError) {
            // El servidor local (LM Studio/Ollama) no está corriendo
            statusCode = 503;
            userMessage = '🔌 No se pudo conectar con el servidor local de IA. Asegúrate de que LM Studio u Ollama estén ejecutándose.';
        }

        res.status(statusCode).json({
            message: userMessage,
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