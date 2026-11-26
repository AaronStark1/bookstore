require('dotenv').config()
const express = require('express')
const cors = require('cors')
const connectDB = require('./config/db.js')

const route = require('./router/route.js');
const appMiddleware = require('./middleware/appMiddleware.js');


const bookStoreServer = express()
bookStoreServer.use(cors())
bookStoreServer.use(express.json())
bookStoreServer.use(appMiddleware)

// Every API route needs the database; wait for it before handling the request.
bookStoreServer.use('/api', async (req, res, next) => {
    try {
        await connectDB()
        next()
    } catch {
        res.status(503).json('The archive database is unreachable. Please try again shortly.')
    }
})

bookStoreServer.use(route)
bookStoreServer.use('/uploads',express.static('./uploads'))

const PORT = process.env.PORT || 3000

bookStoreServer.get('/',(req,res)=>{
    res.send("Welcome to bookstore server")
})
bookStoreServer.listen(PORT,()=>{
    console.log(`Book store server running on port ${PORT}`);
    
})