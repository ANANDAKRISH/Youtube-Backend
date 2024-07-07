import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"
import { application } from "express"

const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId)
        const refreshToken = user.generateRefreshToken()
        const accessToken = user.generateAccessToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave:false })

        return {refreshToken , accessToken} // returning an object containing the 2 generated tokens
        
    } catch (error) {
        throw new ApiError(500,"Something went wrong while generating the tokens")
    }
}

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
        username: username.toLowerCase() // not sure if toLowerCase is required as in the userschema we have set lowercase: true
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
    const {username,email,password} = req.body

    if(!(username || email)) {
        throw new ApiError(400,"Username or email is required to login")
    }

    const user = await User.findOne({
        $or: [{username} , {email}] // I think we need to use username.toLowerCase() as usernames in db are in lowercase
    })

    if(!user) {
        throw new ApiError(404,"User does not exist")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid) {
        throw new ApiError(401,"Invalid User Credentials")
    }

    const {refreshToken , accessToken} = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken") // this is optional , user also 
    // contains same information but it doesnt have the updated refreshToken field. As we are omitting the 
    // refreshToken field from loggedInUser , it is fine if we send user instead of loggedInUser. 

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser,
                accessToken,
                refreshToken
            },
            "User Logged In Successfully"
        )
    )

})

const logoutUser = asyncHandler(async(req,res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken : undefined
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken" , options)
    .clearCookie("refreshToken" , options)
    .json(new ApiResponse(200,{},"User Logged Out Successfully"))

})

const refreshAccessToken = asyncHandler (async(req,res) => {
    const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken

    if(!incomingRefreshToken) {
        throw new ApiError(401,"Unauthorized request")
    }

try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedToken?._id)
    
        if(!user) {
            throw new ApiError(401,"Invalid refresh token")
        }
    
        if(incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401,"Refresh token is expired or used")
        }
    
        const {newRefreshToken , accessToken} = await generateAccessAndRefreshTokens(user._id) 
        // we used the variable name as newRefreshToken instead of refreshToken to avoid any possible clash 
        // with user.refreshToken , but I hope that still won't be an issue
    
        const options = {
            httpOnly:true,
            secure:true
        }
    
        return res
        .status(200)
        .cookie("accessToken",accessToken,options)
        .cookie("refershToken",newRefreshToken,options)
        .json(
            new ApiResponse(
                200,
                {accessToken , refreshToken : newRefreshToken},
                "Access Token Refreshed"
            )
        )
} catch (error) {
    throw new ApiError(401 , error?.message || "Invalid refresh token")
}

})

// I think refreshTOken expiry scenario won't happen. Suppose the user logs in and generates both tokens. Whenever 
// accessToken is refreshed , new refreshToken is also generated. 
// Also on logout both tokens are wiped out and on login , new tokens are generated - thus even if a user login
// after 1 month , new tokens will be generated on new login (refreshTOken may last for days or weeks but anyways
// after logout it is wiped out and new ones are generated when logged in again)

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken
}

