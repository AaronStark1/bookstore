const express = require('express')
const userController = require('../controllers/userController')
const bookController = require('../controllers/bookController')
const jwtMiddleware = require('../middleware/jwtMiddleware')
const multerConfig = require('../middleware/multerMiddleware')
const adminMiddleware = require('../middleware/adminMiddleware')
const route = express.Router()

// AUTH ROUTES
route.post('/api/register', userController.userRegister)
route.post('/api/login', userController.userLogin)
route.post('/api/google-login', userController.googleLogin)

// BOOK ROUTES (PUBLIC & AUTHENTICATED)
route.get('/api/getHomeBooks', bookController.getHomeBooks)
route.get('/api/getBooks', bookController.getBooks)
route.get('/api/viewBook/:id', bookController.viewBook)
route.post('/api/addBook', jwtMiddleware, multerConfig.array('UploadedImages', 5), bookController.addBook)

// ADMIN ROUTES
route.get('/api/getUsers', adminMiddleware, userController.getUsers)
route.get('/api/admin/getBooks', adminMiddleware, bookController.getBooks)
route.put('/api/update-admin', adminMiddleware, multerConfig.single('profile'), userController.updateAdmin)
route.get('/api/getAdmin', adminMiddleware, userController.getAdmin)

// USER & PAYMENT ROUTES
route.put('/api/update-user', jwtMiddleware, multerConfig.single('profile'), userController.updateUser)
route.put('/api/makePayment', jwtMiddleware, bookController.buyBook)

module.exports = route