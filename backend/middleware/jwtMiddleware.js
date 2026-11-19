const jwt = require('jsonwebtoken')

const jwtMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader) {
      return res.status(401).json("Authorization Error: No token provided");
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    const jwtKey = process.env.JWT_KEY;
    if (!jwtKey) {
      console.error("JWT_KEY is not defined in environment variables");
      return res.status(500).json("Server configuration error: JWT_KEY missing");
    }

    const jwtVerification = jwt.verify(token, jwtKey);
    req.payload = jwtVerification.userMail;
    req.user = jwtVerification;
    req.role = jwtVerification.role;
    next();
  } catch (err) {
    console.error("JWT error:", err.message);
    return res.status(401).json("Authorization Error: " + err.message);
  }
};

module.exports = jwtMiddleware;
