import {asyncHandler} from "../utils/asyncHandler.js"

const registerUser = asyncHandler (async (req,res) => {
    const {fullName,email,password,username} = req.body
    console.log("full-name : ",fullName);
    console.log("username : ",username);
})

export {registerUser}

