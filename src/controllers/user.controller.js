import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"

const registerUser = asyncHandler (async (req,res) => {
    const {fullName,email,password,username} = req.body
    // console.log("full-name : ",fullName);
    // console.log("All contents in the request : ", req);
    // console.log("------------");
    // console.log("Request Body : ", req.body);

    if(
        [fullName,email,password,username].some( (field) => field?.trim()==="" )
    ) {
        throw new ApiError(400 , "Allfields are required")
    }

    const existingUser = await User.findOne({
        $or : [{ username },{ email }] // I think we need to use username.toLowerCase() as all usernames in the database are in lowercase
    })
    // console.log(existingUser);

    if(existingUser) {
        throw new ApiError(409 , "User with provided email or username already exists")
    }

    // console.log(req.files);

    const avatarLocalPath = req.files?.avatar?.[0]?.path
    // const coverImageLocalPath = req.files?.coverImage[0]?.path - THIS CAN CAUSE ERROR
    // const coverImageLocalPath = req.files?.coverImage?.[0]?.path - THIS IS THE CORRECT WAY

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length>0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar) {
        throw new ApiError(400 , "Failed to upload image")
    }

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser) {
        throw new ApiError(500,"Something went wrong while registering the user")
    }

    return res.status(201).json(
        new ApiResponse(200,createdUser,"User registered successfully")
    )


})

const loginUser = asyncHandler (async(req,res) => {
    const {email,username,password} = req.body
})

export {
    registerUser,
    loginUser
}

