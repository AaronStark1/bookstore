const mongoose = require('mongoose')

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bookstore'

mongoose.connect(mongoUri)
  .then(() => {
    console.log("MongoDB Connected successfully");
  })
  .catch((err) => {
    console.error("MongoDB Connection error: " + err.message);
  })