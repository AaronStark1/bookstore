const jwt = require('jsonwebtoken')

const jwtMiddleware = (req, res, next) => {
  console.log("Inside jwt Middleware");

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    console.log(token);

    // use the env variable name you set in .env, e.g. JWT_KEY
    const jwtKey = process.env.JWT_KEY;

    const jwtVerification = jwt.verify(token, jwtKey);
    console.log(jwtVerification); // { userMail: '...', role: 'BookStore User', iat: ... }

    req.payload = jwtVerification.userMail;
    next();
  } catch (err) {
    console.error("JWT error:", err);
    return res.status(402).json("Authorization Error " + err);
  }
};

module.exports = jwtMiddleware;
