const User = require('../models/userModel')
const jwt = require('jsonwebtoken')
// logic for register 

exports.userRegister = async (req, res) => {

    const { username, email, password } = req.body

    try {
        const existingUser = await User.findOne({ email })
        if (existingUser) {
            res.status(401).json("User already exists")
        }
        else {
            const newUser = new User({ username, email, password })
            await newUser.save()
            res.status(200).json({ message: "Register Success", newUser })
        }
    } catch (error) {
        res.status(500).json(error)
    }

}

exports.userLogin = async (req, res) => {

    const { email, password } = req.body

    try {
        const existingUser = await User.findOne({ email })
        if (existingUser) {
            if (existingUser.password == password) {
                // token generation 
                const token = jwt.sign({ userMail: existingUser.email, role: existingUser.role }, process.env.JWT_KEY)
                console.log(token);
                res.status(200).json({ message: "Login Success", existingUser, token })

            }
            else {

                res.status(401).json("Password Mismatch!")
            }
        }
        else {
            res.status(404).json("User not found!")
        }

    } catch (error) {
        res.status(500).json(error)
    }

}

exports.googleLogin = async (req, res) => {
    const { username, email, password, profile } = req.body
    try {
        const existingUser = await User.findOne({ email })
        if (existingUser) {
            // token generation 
            const token = jwt.sign({ userMail: existingUser.email, role: existingUser.role }, process.env.JWT_KEY)
            console.log('googleLogin', token);
            res.status(200).json({ message: "Login Success", existingUser, token })
        }
        else {
            const newUser = new User({ username, email, password, profile })
            await newUser.save()
            res.status(200).json({ message: "Register Success", newUser })

            // token generation 
            const token = jwt.sign({ userMail: newUser.email, role: newUser.role }, process.env.JWT_KEY)
            console.log('googleLogin', token);
            res.status(200).json({ message: "Login Success",existingUser:newUser, token })
        }
    } catch (error) {
        res.status(500).json(error)
    }

}

exports.getUsers = async(req,res)=>{
    try {
        const allUsers=await User.find({role:{$ne:"Admin"}})
        res.status(200).json(allUsers)
    } catch (err) {
        res.status(500).json("Error"+err)
    }
}

exports.updateAdmin = async(req,res)=>{
    const {username,password,bio,profile} = req.body
    const email = req.payload
    const role = req.role
    const uploadedProfile = req.file?req.file.filename:profile

    try {
        const updateAdmin=await User.findOneAndUpdate({email},{username,password,bio,profile:uploadedProfile,bio,role},{new:true})
        await updateAdmin.save()
        res.status(200).json({message:"Updated Successfully...",updateAdmin})
    } catch (err) {
        res.status(500).json("Error"+err)
    }
}

exports.getAdmin = async(req,res)=>{
    try {
        const admin=await User.findOne({role:{$eq:"Admin"}})
        res.status(200).json(admin)
    } catch (err) {
        res.status(500).json("Error"+err)
    }
}

exports.updateUser = async (req, res) => {
  const { username, password, bio, profile } = req.body;
  const email = req.payload;                     // set by jwtMiddleware from token
  const uploadedProfile = req.file ? req.file.filename : profile;

  try {
    const updateUser = await User.findOneAndUpdate(
      { email },
      { username, password, bio, profile: uploadedProfile },
      { new: true }
    );
    if (!updateUser) {
      return res.status(404).json("User not found");
    }
    await updateUser.save();
    res.status(200).json({ message: "Updated Successfully...", updateUser });
  } catch (err) {
    res.status(500).json("Error" + err);
  }
};
