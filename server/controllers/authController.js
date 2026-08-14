const User = require('../models/User'); // Traemos el "molde" del usuario
const { deleteAllUserData } = require('../services/userDataService');
const bcrypt = require('bcrypt');   // Traemos la herramienta de seguridad
const jwt = require('jsonwebtoken')

// Firma el JWT y lo guarda en una cookie HttpOnly (usado en registro y login).
function issueSessionCookie(res, user) {
  const token = jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' } // La pulsera expira en 7 días
  );

  // Do not relax sameSite to 'lax' or 'none' without reading this first. It is what stops a
  // page on another domain from making the browser attach this cookie to a request, and the
  // routes it guards no longer hold only chats: /api/keys hands out the user's provider API
  // keys. 'lax' is the usual reflex when a sign-in flow misbehaves — if that ever comes up,
  // fix the flow, and check the ALLOWED_ORIGINS list in app.js before touching this line.
  res.cookie('token', token, {
    httpOnly: true,                                // JavaScript cannot read this cookie, so XSS cannot steal it
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production; plain HTTP is allowed in development
    sameSite: 'strict',                            // The browser never sends it on requests coming from another site
    maxAge: 7 * 24 * 60 * 60 * 1000               // Expires in 7 days, same as the token
  });
}

// Lógica para Registrar un nuevo usuario
exports.register = async (req, res) => {
  try {
    // 0. Si el registro está deshabilitado por configuración, frenar antes de tocar la DB
    if (process.env.REGISTRATION_ENABLED === 'false') {
      return res.status(403).json({ message: 'New account registration is disabled' });
    }

    // 1. Extraer el email y la password que el usuario mandó en la petición
    const { email, password, acceptedTerms } = req.body;

    // 1b. El registro exige haber aceptado los términos y la política de privacidad
    if (acceptedTerms !== true) {
      return res.status(400).json({ message: 'You must accept the terms and the privacy policy' });
    }

    // 2. Verificar si el correo ya existe en la base de datos
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // Si ya existe, frenamos todo y respondemos con un error 400 (Bad Request)
      return res.status(400).json({ message: 'That email address is already registered' });
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

    res.status(201).json({ message: 'Account created successfully' });

  } catch (error) {
    // Si algo falla en el proceso (ej. se cae la base de datos), atrapamos el error
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Paso A: Buscar si el usuario existe por su correo
    const user = await User.findOne({ email });
    if (!user) {
      // Por seguridad, usamos un mensaje genérico para no darle pistas a los hackers
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Paso B: Comparar la contraseña ingresada con la encriptada en la BD
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Paso C: Si todo está bien, guardar el token en una cookie HttpOnly y responder éxito
    issueSessionCookie(res, user);

    res.status(200).json({
      message: 'Signed in successfully'
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Cambia el email del usuario autenticado (requiere confirmar con la contraseña actual)
exports.updateEmail = async (req, res) => {
  try {
    const { newEmail, currentPassword } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect password' });
    }

    const normalizedEmail = String(newEmail || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ message: 'The email address is required' });
    }

    const existingUser = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: req.user.id }
    });
    if (existingUser) {
      return res.status(400).json({ message: 'That email address is already registered' });
    }

    user.email = normalizedEmail;
    await user.save();

    res.status(200).json({ message: 'Email updated successfully', email: user.email });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Cambia la contraseña del usuario autenticado (requiere confirmar con la contraseña actual)
exports.updatePassword = async (req, res) => {
  try {
    const { newPassword, currentPassword } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect password' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'The password must be at least 6 characters long' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Elimina permanentemente la cuenta del usuario autenticado y todos sus datos
exports.deleteAccount = async (req, res) => {
  try {
    const { currentPassword } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect password' });
    }

    // Los datos primero y el dueño al final: el orden lo explica userDataService.
    await deleteAllUserData(req.user.id);
    await User.findByIdAndDelete(req.user.id);

    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.status(200).json({ message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Limpia la cookie del token en el navegador del usuario
exports.logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  res.status(200).json({ message: 'Signed out successfully' });
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};