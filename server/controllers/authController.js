const User = require('../models/User'); // Traemos el "molde" del usuario
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const bcrypt = require('bcrypt');   // Traemos la herramienta de seguridad
const jwt = require('jsonwebtoken')

// Firma el JWT y lo guarda en una cookie HttpOnly (usado en registro y login).
function issueSessionCookie(res, user) {
  const token = jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' } // La pulsera expira en 7 días
  );

  res.cookie('token', token, {
    httpOnly: true,                                // 👈 Protege contra XSS (JS no puede leer esta cookie)
    secure: process.env.NODE_ENV === 'production', // 👈 Solo HTTPS en producción (en desarrollo permite HTTP)
    sameSite: 'strict',                            // 👈 Protege contra CSRF (la cookie no se envía desde otros sitios)
    maxAge: 7 * 24 * 60 * 60 * 1000               // 👈 Expira en 7 días (igual que el token)
  });
}

// Lógica para Registrar un nuevo usuario
exports.register = async (req, res) => {
  try {
    // 0. Si el registro está deshabilitado por configuración, frenar antes de tocar la DB
    if (process.env.REGISTRATION_ENABLED === 'false') {
      return res.status(403).json({ message: 'El registro de nuevas cuentas está deshabilitado' });
    }

    // 1. Extraer el email y la password que el usuario mandó en la petición
    const { email, password, acceptedTerms } = req.body;

    // 1b. El registro exige haber aceptado los términos y la política de privacidad
    if (acceptedTerms !== true) {
      return res.status(400).json({ message: 'Debes aceptar los términos y la política de privacidad' });
    }

    // 2. Verificar si el correo ya existe en la base de datos
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // Si ya existe, frenamos todo y respondemos con un error 400 (Bad Request)
      return res.status(400).json({ message: 'El correo electrónico ya está registrado' });
    }

    // 3. Seguridad: Encriptar la contraseña antes de guardarla
    const salt = await bcrypt.genSalt(10); // Genera la "sal" aleatoria (nivel de seguridad 10)
    const hashedPassword = await bcrypt.hash(password, salt); // Mezcla la clave con la sal y crea el hash

    // 4. Crear la instancia del usuario usando el modelo con la clave encriptada
    const newUser = new User({
      email,
      password: hashedPassword, // Reemplazamos la clave original por la versión ultra segura
      acceptedTermsAt: new Date()
    });

    // 5. Guardar el nuevo usuario de forma definitiva en MongoDB Atlas
    await newUser.save();

    // 6. Iniciar sesión automáticamente: mismo mecanismo de cookie que el login.
    issueSessionCookie(res, newUser);

    res.status(201).json({ message: 'Usuario registrado con éxito de forma segura' });

  } catch (error) {
    // Si algo falla en el proceso (ej. se cae la base de datos), atrapamos el error
    res.status(500).json({ message: 'Hubo un error en el servidor', error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Paso A: Buscar si el usuario existe por su correo
    const user = await User.findOne({ email });
    if (!user) {
      // Por seguridad, usamos un mensaje genérico para no darle pistas a los hackers
      return res.status(400).json({ message: 'Credenciales incorrectas' });
    }

    // Paso B: Comparar la contraseña ingresada con la encriptada en la BD
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Credenciales incorrectas' });
    }

    // Paso C: Si todo está bien, guardar el token en una cookie HttpOnly y responder éxito
    issueSessionCookie(res, user);

    res.status(200).json({
      message: '¡Inicio de sesión exitoso! Bienvenido.'
    });

  } catch (error) {
    res.status(500).json({ message: 'Hubo un error en el servidor', error: error.message });
  }
};

// Cambia el email del usuario autenticado (requiere confirmar con la contraseña actual)
exports.updateEmail = async (req, res) => {
  try {
    const { newEmail, currentPassword } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ message: 'Usuario no encontrado' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Contraseña incorrecta' });
    }

    const normalizedEmail = String(newEmail || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ message: 'El correo electrónico es obligatorio' });
    }

    const existingUser = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: req.user.id }
    });
    if (existingUser) {
      return res.status(400).json({ message: 'El correo electrónico ya está registrado' });
    }

    user.email = normalizedEmail;
    await user.save();

    res.status(200).json({ message: 'Correo actualizado con éxito', email: user.email });
  } catch (error) {
    res.status(500).json({ message: 'Hubo un error en el servidor', error: error.message });
  }
};

// Cambia la contraseña del usuario autenticado (requiere confirmar con la contraseña actual)
exports.updatePassword = async (req, res) => {
  try {
    const { newPassword, currentPassword } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ message: 'Usuario no encontrado' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Contraseña incorrecta' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.status(200).json({ message: 'Contraseña actualizada con éxito' });
  } catch (error) {
    res.status(500).json({ message: 'Hubo un error en el servidor', error: error.message });
  }
};

// Elimina permanentemente la cuenta del usuario autenticado y todos sus datos
exports.deleteAccount = async (req, res) => {
  try {
    const { currentPassword } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ message: 'Usuario no encontrado' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Contraseña incorrecta' });
    }

    const userChats = await Chat.find({ userId: req.user.id }).select('id');
    const chatIds = userChats.map((chat) => chat.id);

    await Message.deleteMany({ chatId: { $in: chatIds } });
    await Chat.deleteMany({ userId: req.user.id });
    await User.findByIdAndDelete(req.user.id);

    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.status(200).json({ message: 'Cuenta eliminada con éxito' });
  } catch (error) {
    res.status(500).json({ message: 'Hubo un error en el servidor', error: error.message });
  }
};

// Limpia la cookie del token en el navegador del usuario
exports.logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  res.status(200).json({ message: 'Sesión cerrada con éxito.' });
};

// Valida si la sesión sigue activa (el middleware ya comprobó el JWT)
exports.me = async (req, res) => {
  try {
    // Si llegó aquí es porque el token fue válido en el middleware
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ authenticated: false });
    }
    res.status(200).json({ authenticated: true, userId: req.user.id, email: user.email });
  } catch (error) {
    res.status(500).json({ message: 'Hubo un error en el servidor', error: error.message });
  }
};