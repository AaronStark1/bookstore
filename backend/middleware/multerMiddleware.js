const multer = require('multer')

// Setup of Destination and filename 
const storage = multer.diskStorage({
    destination:function (req,file,cb) {
        cb(null,'./uploads')
    },
    filename: function (req,file,cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null,`IMG-${file.originalname} '-' ${uniqueSuffix}`)
    }
})
function fileFilter(req,file,cb) {
    cb(null,false)
    if (file.mimetype=='image/png'||file.mimetype=='image/jpeg'||file.mimetype=='image/jpg') {
       cb(null,true) 
    }
    else{
        cb(null,false)
        return cb(new Error(`I don't have a clue!`))
    }
    
}
const multerConfig = multer({
    storage,
    fileFilter
})
module.exports=multerConfig