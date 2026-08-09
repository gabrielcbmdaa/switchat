const Chat = require('../models/Chat');
const Message = require('../models/Message');
const ApiKey = require('../models/ApiKey');

// ⚠️ Este es el ÚNICO sitio del servidor donde se borran los datos de un usuario. Todo
// modelo nuevo que lleve un campo `userId` TIENE que añadirse aquí.
//
// Olvidarlo no da ningún error: los documentos simplemente sobreviven a la cuenta y quedan
// inalcanzables para siempre. Todas las consultas filtran por `req.user.id`, que sale del
// JWT, que solo se emite tras encontrar el documento en `users`. Sin usuario no hay login,
// sin login no hay userId, y ningún `deleteMany({ userId })` vuelve a apuntar a esas filas.
// Así fue exactamente como las ApiKey quedaron huérfanas hasta que se arregló.

/**
 * Borra todo lo que pertenece a un usuario, pero NO el documento `User`: esta función cubre
 * los datos poseídos, y el dueño lo elimina quien la llama, justo después.
 *
 * Ese reparto no es casual. No hay transacciones (Mongo las exige sobre replica set y aquí
 * corremos en standalone), así que un fallo a media función deja una cuenta con datos de
 * menos, algo que el usuario arregla repitiendo la acción. Si el `User` cayera primero, el
 * mismo fallo dejaría huérfanos irrecuperables, que es justo lo que esto evita.
 */
async function deleteAllUserData(userId) {
    // Lo más sensible primero: si algo va a sobrevivir a un fallo, que no sean credenciales.
    await ApiKey.deleteMany({ userId });

    // Los mensajes se enlazan con el campo `id` del chat (string propio), no con su `_id`,
    // así que hay que leer los chats ANTES de borrarlos o se pierde la referencia.
    const userChats = await Chat.find({ userId }).select('id');
    const chatIds = userChats.map((chat) => chat.id);

    await Message.deleteMany({ chatId: { $in: chatIds } });
    await Chat.deleteMany({ userId });
}

module.exports = { deleteAllUserData };
