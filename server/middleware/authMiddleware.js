const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    // 👈 Ahora leemos el token directamente de la cookie que Express analiza gracias a cookie-parser
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ message: 'Token no proporcionado' });
    }
        
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Token inválido o expirado' });
    }   
}