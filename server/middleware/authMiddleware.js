const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
    // 👈 Ahora leemos el token directamente de la cookie que Express analiza gracias a cookie-parser
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ message: 'Token no proporcionado' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const userExists = await User.exists({ _id: decoded.id });
        if (!userExists) {
            return res.status(401).json({ message: 'Token inválido o expirado' });
        }

        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Token inválido o expirado' });
    }
}