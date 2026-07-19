const Message = require('../models/Message');
const Chat = require('../models/Chat');

const handleApiError = async (response, res, providerLowerCase, modelLowerCase) => {
    const errorText = await response.text();
    console.error(`❌ Detalle del error de la API (${providerLowerCase}):`, errorText);

    let apiErrorMessage = errorText;
    try {
        const errorJson = JSON.parse(errorText);
        apiErrorMessage = errorJson.error?.message || errorJson.message || errorText;
    } catch {
        // Si no es JSON, usamos el texto plano tal cual
    }

    const statusCode = response.status;
    const errorMap = {
        401: `🔑 Invalid or expired API Key for ${providerLowerCase}. Check your key in Config.`,
        403: `🚫 Access denied by ${providerLowerCase}. Your API Key does not have permissions to use the model "${modelLowerCase}".`,
        404: `❓ The model "${modelLowerCase}" does not exist or is unavailable in ${providerLowerCase}.`,
        429: `⏳ Too many requests to ${providerLowerCase}. You have reached the rate limit. Please wait a moment and try again.`,
        503: `🔥 The model "${modelLowerCase}" is experiencing high demand right now. Try again in a few seconds or try another model.`,
    };

    const userMessage = errorMap[statusCode] || `Error ${statusCode} de ${providerLowerCase}: ${apiErrorMessage}`;

    return res.status(statusCode >= 500 ? 502 : statusCode).json({
        message: userMessage,
        error: apiErrorMessage,
        code: statusCode,
        provider: providerLowerCase,
        model: modelLowerCase
    });
};

exports.createMessage = async (req, res) => {
    try {
        // 1. Extraemos los datos que vienen del frontend
        const { chatId } = req.params;
        const { content, messages, model, provider, reasoningLevel } = req.body;

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
        // ------------------------------------------
        // PROVEEDOR GOOGLE GEMINI (API REST NATIVA)
        // ------------------------------------------
        if (providerLowerCase === 'google') {
            const apiKey = process.env.GOOGLE_API_KEY;
            if (!apiKey) {
                throw new Error("⚠️ API Key de Google no fue encontrada.");
            }

            console.log(`🚀 Enviando petición nativa a Google Gemini con modelo: ${modelLowerCase}`);

            // Separar mensajes de sistema si existen
            const systemMessages = messages.filter(msg => msg.role === 'system');
            const systemInstruction = systemMessages.length > 0 ? {
                parts: [{ text: systemMessages.map(msg => msg.parts?.[0]?.text || '').join('\n') }]
            } : undefined;

            // Formatear el historial de mensajes al formato nativo de Gemini (contents)
            const contents = messages
                .filter(msg => msg.role !== 'system')
                .map(msg => ({
                    role: msg.role === 'model' ? 'model' : 'user',
                    parts: [{ text: msg.parts?.[0]?.text || '' }]
                }));

            // Configurar opciones de generación y razonamiento (Thinking Config)
            const generationConfig = {};
            if (reasoningLevel && reasoningLevel !== 'off') {
                const thinkingLevelMap = {
                    'minimal': 'MINIMAL',
                    'low': 'LOW',
                    'medium': 'MEDIUM',
                    'high': 'HIGH'
                };
                generationConfig.thinkingConfig = {
                    thinkingLevel: thinkingLevelMap[reasoningLevel] || 'HIGH'
                };
            } else {
                generationConfig.thinkingConfig = {
                    thinkingBudget: 0
                };
            }

            const googleRequestBody = {
                contents,
                ...(systemInstruction ? { systemInstruction } : {}),
                ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {})
            };

            const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelLowerCase}:generateContent?key=${apiKey}`;

            const response = await fetch(googleApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(googleRequestBody)
            });

            if (!response.ok) {
                return await handleApiError(response, res, providerLowerCase, modelLowerCase);
            }

            const data = await response.json();
            const candidate = data.candidates?.[0];
            if (!candidate || !candidate.content || !candidate.content.parts) {
                return res.status(502).json({
                    message: 'La API de Google Gemini no devolvió ninguna respuesta válida.',
                    provider: providerLowerCase,
                    model: modelLowerCase
                });
            }

            const parts = candidate.content.parts;
            // Filtrar y devolver únicamente la respuesta final (excluyendo trazas de razonamiento 'thought: true')
            const responseText = parts
                .filter(part => !part.thought && part.text)
                .map(part => part.text)
                .join('') || parts.map(part => part.text || '').join('');

            // GUARDAR LA RESPUESTA DE LA AI en MongoDB Atlas
            const aiMessage = new Message({
                chatId,
                sender: 'ai',
                content: responseText
            });
            await aiMessage.save();

            // RESPONDER AL FRONTEND
            return res.status(201).json({
                text: responseText,
                userMessageId: userMessage._id,
                aiMessageId: aiMessage._id
            });
        }

        // ------------------------------------------
        // OTROS PROVEEDORES (OPENAI, ANTHROPIC, LM STUDIO, OLLAMA)
        // ------------------------------------------
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

        const requestBody = {
            model: modelLowerCase,
            messages: formattedMessages
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        // 5. MANEJO ROBUSTO DE ERRORES DE LA API DEL PROVEEDOR
        if (!response.ok) {
            return await handleApiError(response, res, providerLowerCase, modelLowerCase);
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