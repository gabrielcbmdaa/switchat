const Message = require('../models/Message');
const Chat = require('../models/Chat');

// 💾 GUARDAR UN MENSAJE SUELTO
// Escritura pura: el cliente llama al proveedor y nos manda el resultado. El cliente
// hace dos peticiones por intercambio (el prompt antes de generar, la respuesta después),
// así que este handler no sabe nada de conversaciones ni de modelos.
exports.createMessage = async (req, res) => {
    try {
        const { chatId } = req.params;
        const { sender, content, model, reasoningLevel } = req.body;

        // Guardia de forma. Una pestaña abierta antes del despliegue sigue mandando el body
        // viejo (sin `sender`) y esperando un `text` de vuelta: sin este 400 recibiría un 201,
        // leería `undefined` y guardaría una respuesta vacía. Mejor un error que se arregla
        // recargando que una conversación corrompida en silencio.
        if (sender !== 'user' && sender !== 'ai') {
            return res.status(400).json({ message: 'The sender field must be "user" or "ai"' });
        }

        if (!content || content.trim() === '') {
            return res.status(400).json({ message: 'The message content is required' });
        }

        // Message no guarda userId, así que la propiedad se comprueba contra el chat padre.
        // Sin esto el endpoint permitiría escribir en la conversación de cualquiera con solo
        // acertar un chatId, y de paso nos da el 404 natural para chats que ya no existen.
        const chatExists = await Chat.exists({ id: chatId, userId: req.user.id });
        if (!chatExists) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        // createdAt lo pone el servidor (default del schema) y se devuelve: getMessages ordena
        // por él, y aceptar el reloj del cliente desordenaría la conversación al recargar.
        // reasoningLevel viaja sin guardia propia, igual que model: falta en los mensajes de
        // usuario y en todo lo que guardó una versión anterior, y ausente es un caso válido.
        const message = new Message({
            chatId,
            sender,
            content,
            ...(model ? { model } : {}),
            ...(reasoningLevel ? { reasoningLevel } : {})
        });
        await message.save();

        // La lista de chats se ordena por esta fecha. $max y no $set: un intercambio son dos
        // peticiones (el prompt y la respuesta) y nada garantiza que lleguen en orden; con
        // $set la que llegase tarde tiraría la fecha hacia atrás, y $max solo deja avanzar.
        await Chat.updateOne({ id: chatId }, { $max: { lastMessageAt: message.createdAt } });

        return res.status(201).json({
            _id: message._id,
            createdAt: message.createdAt
        });

    } catch (error) {
        console.error("❌ Error en createMessage:", error);
        res.status(500).json({ message: 'Failed to save the message', error: error.message });
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
        res.status(500).json({ message: 'Failed to read the database', error: error.message });
    }
};

// 📂 OBTENER MENSAJES PAGINADOS DE UN CHAT ESPECÍFICO
exports.getMessages = async (req, res) => {
    try {
        const { chatId } = req.params;
        const limit = parseInt(req.query.limit) || 6;
        const before = req.query.before; // Fecha ISO

        // Message no guarda userId, así que la propiedad se comprueba contra el chat padre,
        // igual que en createMessage. Sin esto bastaba acertar un chatId para leer la
        // conversación de cualquiera, y la respuesta entregaba además los _id de cada
        // mensaje, que es justo lo que necesita deleteMessage.
        const chatExists = await Chat.exists({ id: chatId, userId: req.user.id });
        if (!chatExists) {
            return res.status(404).json({ message: 'Chat not found' });
        }

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
            model: msg.model,
            reasoningLevel: msg.reasoningLevel
        })).reverse();

        res.json(formattedMessages);

    } catch (error) {
        console.error("❌ Error en getMessages:", error);
        res.status(500).json({ message: 'Failed to read the messages from the database', error: error.message });
    }
};

// 🔄 1. SINCRONIZAR CHAT (Actualizar, y Crear solo si lo piden)
// Si el body trae messages[] y el chat aún no tiene mensajes en Message, los siembra una sola vez.
//
// Crear es la excepción, no la norma: el cliente solo pide allowCreate en los dos sitios donde
// un chat nace de verdad (el de bienvenida y el primer envío). El resto de llamadas —borrador,
// título, modelo, nivel, los dos interruptores— actualizan algo que ya existe, y dejarlas crear
// era lo que resucitaba chats: una de esas peticiones puede salir antes del DELETE y llegar
// después, y con upsert siempre puesto volvía a escribir en Mongo el chat recién borrado.
exports.syncChat = async (req, res) => {
    try {
        const { messages, allowCreate, ...chatFields } = req.body;
        delete chatFields._id; // Evitamos romper MongoDB / schema Chat (messages no pertenece aquí)
        // lastMessageAt es del servidor, no del cliente. El cliente manda el chat ENTERO en
        // cada guardado (borrador, título, modelo...), así que aceptarlo aquí dejaría que una
        // copia vieja pisara la fecha buena: createMessage la sube al llegar la respuesta y el
        // guardado del título, que sale de un chat capturado antes, la devolvería atrás.
        delete chatFields.lastMessageAt;

        chatFields.userId = req.user.id;

        const chat = await Chat.findOneAndUpdate(
            { id: chatFields.id, userId: req.user.id },
            { $set: chatFields },
            { upsert: Boolean(allowCreate), returnDocument: 'after' }
        );

        // Sin chat no hay dónde colgar nada. Salir aquí es lo que impide que los mensajes que
        // viajan en el body se reinserten sueltos, sin conversación que los contenga.
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

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
                            ...(msg.model ? { model: msg.model } : {}),
                            ...(msg.reasoningLevel ? { reasoningLevel: msg.reasoningLevel } : {})
                        };
                    })
                    .filter(Boolean);

                if (docs.length > 0) {
                    await Message.insertMany(docs);
                    // Un chat que sube de localStorage llega con toda su conversación de golpe,
                    // y sin esto entraría en la lista sin fecha de actividad: caeria en su
                    // createdAt, que es el momento de la migración y no el de la conversación.
                    const newest = docs.reduce(
                        (latest, doc) => (doc.createdAt > latest ? doc.createdAt : latest),
                        docs[0].createdAt
                    );
                    await Chat.updateOne({ id: chatFields.id }, { $max: { lastMessageAt: newest } });
                }
            }
        }

        res.json({ message: 'Chat synchronized successfully', chat });
    } catch (error) {
        console.error("❌ Error en syncChat:", error);
        res.status(500).json({ message: 'Failed to save the chat to the database', error: error.message });
    }
};

// 🗑️ 2. ELIMINAR CHAT (¡Con truco profesional!)
exports.deleteChat = async (req, res) => {
    try {
        const chatIdToDelete = req.params.id;

        // El userId va en el propio deleteOne. Antes se buscaba el chat filtrando por dueño
        // pero el resultado no se usaba para nada y el borrado iba sin filtro: aparentaba
        // una comprobación que no existía, y cualquiera con sesión borraba el chat ajeno.
        const deleted = await Chat.deleteOne({ id: chatIdToDelete, userId: req.user.id });

        // deletedCount es lo que distingue "no era tuyo" de "sí lo era": sin este 404 la
        // respuesta era un 200 que afirmaba haber borrado algo que no se tocó.
        if (deleted.deletedCount === 0) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        // 🔥 PRO-TIP: También borramos todos los mensajes que pertenecían a ese chat
        // así evitamos dejar datos "fantasma" ocupando espacio en MongoDB Atlas
        await Message.deleteMany({ chatId: chatIdToDelete });

        res.json({ message: 'Chat and its messages deleted successfully' });
    } catch (error) {
        console.error("❌ Error en deleteChat:", error);
        res.status(500).json({ message: 'Failed to delete the chat', error: error.message });
    }
};

// 🗑️ 3. ELIMINAR UN MENSAJE INDIVIDUAL
exports.deleteMessage = async (req, res) => {
    try {
        const { chatId, messageId } = req.params;

        // Mismo permiso que en createMessage: sale del chat padre, no del mensaje.
        const chatExists = await Chat.exists({ id: chatId, userId: req.user.id });
        if (!chatExists) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        // El borrado se acota también por chatId. Comprobar solo el chat padre dejaría un
        // chat propio como llave para el messageId de otro: la ruta lleva los dos en la URL
        // y nada obliga a que se correspondan.
        const deletedMessage = await Message.findOneAndDelete({ _id: messageId, chatId });

        if (!deletedMessage) {
            return res.status(404).json({ message: 'Message not found' });
        }

        // Se recalcula en vez de subirse con $max, porque este es el unico camino que mueve la
        // fecha HACIA ATRAS: borrado el ultimo mensaje, el chat seguiria flotando arriba de la
        // lista por una conversacion que ya no existe. Va sobre el indice { chatId, createdAt,
        // _id } que ya usa getMessages, y sin mensajes el campo se retira del todo.
        const newest = await Message.findOne({ chatId }).sort({ createdAt: -1, _id: -1 });
        await Chat.updateOne(
            { id: chatId },
            newest
                ? { $set: { lastMessageAt: newest.createdAt } }
                : { $unset: { lastMessageAt: 1 } }
        );

        res.json({ message: 'Message deleted successfully' });
    } catch (error) {
        console.error("❌ Error en deleteMessage:", error);
        res.status(500).json({ message: 'Failed to delete the message', error: error.message });
    }
};