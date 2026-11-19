const jwt = require('jsonwebtoken')

const adminMiddleware = (req, res, next) => {
  console.log("Inside admin jwt Middleware");

  try {
    const token = req.headers.authorization.slice(7);

    console.log(token);

    // use the env variable name you set in .env, e.g. JWT_KEY
    const jwtKey = process.env.JWT_KEY;

    const jwtVerification = jwt.verify(token, jwtKey);
    console.log(jwtVerification); // { userMail: '...', role: 'BookStore User', iat: ... }

    req.payload = jwtVerification.userMail;
    req.role=jwtVerification.role
    if (req.role=='Admin') {
        next()
    } else {
        res.status(403).json("Authorization Error..only admin can access")
    }
  } catch (err) {
    return res.status(402).json("Authorization Error " + err);
  }
};

module.exports = adminMiddleware;
