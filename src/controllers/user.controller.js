import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { deleteFromCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"

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
            $unset: {
                refreshToken : 1
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
    .json(new ApiResponse(200,{User : req.user.username},"User Logged Out Successfully"))

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
    
        const {refreshToken , accessToken} = await generateAccessAndRefreshTokens(user._id) 
        
        const options = {
            httpOnly:true,
            secure:true
        }
    
        return res
        .status(200)
        .cookie("accessToken",accessToken,options)
        .cookie("refreshToken",refreshToken,options)
        .json(
            new ApiResponse(
                200,
                {accessToken , refreshToken},
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

const changeCurrentPassword = asyncHandler (async(req,res) => {
    const {oldPassword , newPassword , confPassword} = req.body

    if(!(newPassword === confPassword)) {
        throw new ApiError(401,"New password and confirmed password doesn't match")
    }

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect) {
        throw new ApiError(401,"Invalid old password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave : false})

    return res
    .status(200)
    .json(new ApiResponse(200 , {} , "Password updated successfully"))

})

const getCurrentUser = asyncHandler (async(req,res) => {

    return res
    .status(200)
    .json(new ApiResponse(200, req.user , "Current User fetched successfully"))
})

const updateAccountDetails = asyncHandler (async(req,res) => {

    const {fullName , email} = req.body // username is something which is usually not updated once set

    if(!fullName || !email) {
        throw new ApiError(400,"All fields are required")
    } // Same as if (!(fullName && email))

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set : {
                fullName : fullName,
                email : email
                // as field name & value is reprsented by same name , we can simply write {fullName , email} 
                // instead of {fullName: fullName , email : email}
            }
        },
        {
            new: true
        }
    ).select("-password -refreshToken")

    return res
    .status(200)
    .json(new ApiResponse(200 , user , "Account Details updated successfully"))
})

const updateUserAvatar = asyncHandler (async(req,res) => {
    const avatarLocalPath = req.file?.path

    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if(!avatar.url) { // if(!avatar) is also fine
        throw new ApiError(400 , "Failed to upload image")
    }

    const currentUser = await User.findById(req.user._id)
    const oldAvatarUrl = currentUser.avatar

    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                avatar : avatar.url
            }
        },
        {new: true}
    ).select("-password -refreshToken")
     
    // If update successful, delete old avatar from Cloudinary
    if(user && oldAvatarUrl) {
        await deleteFromCloudinary(oldAvatarUrl)
    }

    return res
    .status(200)
    .json(new ApiResponse(200 , user , "Avatar image updated successfully"))
})

const updateUserCoverImage = asyncHandler (async(req,res) => {

    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath) {
        throw new ApiError(400,"Cover Image file is missing")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!coverImage.url) {
        throw new ApiError(401,"Error while uploading the coverImage file")
    }

    const currentUser = await User.findById(req.user._id)
    const oldCoverImageUrl = currentUser.coverImage

    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set : {
                coverImage : coverImage.url
            }
        },
        {new:true}
    ).select("-password -refreshToken")

    if(user && oldCoverImageUrl) {
        await deleteFromCloudinary(oldCoverImageUrl)
    }

    return res
    .status(200)
    .json(new ApiResponse(200,user,"Cover Image updated successfully"))

})

const getUserChannelProfile = asyncHandler (async(req,res) => {
    const {username} = req.params

    if(!username?.trim()) {
        throw new ApiError(400,"Username of channel is missing")
    }

    const channel = await User.aggregate([
        {
            $match : {
                username : username?.toLowerCase()
            }
        },
        {
            $lookup : {
                from: "subscriptions",
                localField : "_id",
                foreignField : "channel",
                as: "subscribers"
            }
        },
        {
            $lookup : {
                from: "subscriptions",
                localField : "_id",
                foreignField : "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields : {
                subscribersCount : {
                    $size : "$subscribers"
                },
                channelsSubscribedToCOunt : {
                    $size : "$subscribedTo"
                },
                isSubscribed : {
                    $cond : {
                        if: {$in : [req.user?._id , "$subscribers.subscriber"]},
                        then : true,
                        else : false
                    }
                }
            }
        },
        {
            $project : {
                fullName : 1,
                username : 1,
                subscribersCount : 1,
                channelsSubscribedToCOunt : 1,
                isSubscribed : 1,
                avatar : 1,
                coverImage : 1,
                email : 1
            }
        }
    ])

    if(!channel?.length) { // if length of array is 0 ,this condition becomes true. Len of array being 0 means no such user exist
        throw new ApiError(401,"Channel doesn't exist")
    }

    return res
    .status(200)
    .json(
        new ApiResponse(200 , channel[0] , "User channel fetched successfully")
    )
})

const getWatchHistory = asyncHandler (async(req,res) => {
    const user = await User.aggregate([
        {
            $match : {
                _id : new mongoose.Types.ObjectId(req.user._id)
            }
            
        },
        {
            $lookup: {
                from : "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project : {
                                        fullName : 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields : {
                            owner: {
                                $first : "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
    .status(200)
    .json(
        new ApiResponse(
            200, 
            user[0].getWatchHistory,
            "Watch History fetched successfully"
        )
    )
})



export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
}

