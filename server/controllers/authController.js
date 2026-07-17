const User = require('../models/User'); // Traemos el "molde" del usuario
const bcrypt = require('bcrypt');   // Traemos la herramienta de seguridad
const jwt = require('jsonwebtoken')

// Lógica para Registrar un nuevo usuario
exports.register = async (req, res) => {
  try {
    // 1. Extraer el email y la password que el usuario mandó en la petición
    const { email, password } = req.body;

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
      password: hashedPassword // Reemplazamos la clave original por la versión ultra segura
    });

    // 5. Guardar el nuevo usuario de forma definitiva en MongoDB Atlas
    await newUser.save();

    // 6. Responder al cliente que todo salió perfecto (Status 201: Created)
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

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' } // La pulsera expira en 7 días
    );

    // Paso C: Si todo está bien, guardar el token en una cookie HttpOnly y responder éxito
    res.cookie('token', token, {
      httpOnly: true,                                // 👈 Protege contra XSS (JS no puede leer esta cookie)
      secure: process.env.NODE_ENV === 'production', // 👈 Solo HTTPS en producción (en desarrollo permite HTTP)
      sameSite: 'strict',                            // 👈 Protege contra CSRF (la cookie no se envía desde otros sitios)
      maxAge: 7 * 24 * 60 * 60 * 1000               // 👈 Expira en 7 días (igual que el token)
    });

    res.status(200).json({
      message: '¡Inicio de sesión exitoso! Bienvenido.'
    });

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
exports.me = (req, res) => {
  // Si llegó aquí es porque el token fue válido en el middleware
  res.status(200).json({ authenticated: true, userId: req.user.id });
};