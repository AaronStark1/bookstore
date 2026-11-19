require('dotenv').config()
const express = require('express')
const cors = require('cors')
require('./config/db.js')

const route = require('./router/route.js');
const appMiddleware = require('./middleware/appMiddleware.js');


const bookStoreServer = express()
bookStoreServer.use(cors())
bookStoreServer.use(express.json())
bookStoreServer.use(appMiddleware)

bookStoreServer.use(route)
bookStoreServer.use('/uploads',express.static('./uploads'))

const PORT =3000|| process.env.PORT

bookStoreServer.get('/',(req,res)=>{
    res.send("Welcome to bookstore server")
})
bookStoreServer.listen(PORT,()=>{
    console.log(`Book store server running on port ${PORT}`);
    
})