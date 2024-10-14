import mongoose, { isValidObjectId } from "mongoose"
import {Like} from "../models/like.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const toggleVideoLike = asyncHandler(async (req, res) => {
    const {videoId} = req.params
    
    if(!isValidObjectId(videoId)) {
        throw new ApiError(400,"Invalid Video ID")
    }
    
    const isLiked = await Like.findOne(
        {
            likedBy : req.user?._id,
            video : videoId
        }
    )

    if(isLiked) {
        await Like.findByIdAndDelete(isLiked?._id)
        return res
               .status(200)
               .json(new ApiResponse(200,{Liked : false},"Video like removed successfully"))
    }

    const likeDocument = await Like.create(
        {
            likedBy : req.user?._id,
            video : videoId
        }
    ) 

    if(!likeDocument) {
        throw new ApiError(400,"Like document creation failed")
    }

    return res
           .status(200)
           .json(new ApiResponse(200,{Liked : true},"Video Like successfully"))
})

const toggleCommentLike = asyncHandler(async (req, res) => {
    const {commentId} = req.params
    
    if(!isValidObjectId(commentId)) {
        throw new ApiError(400,"Inavlid Comment Id")
    }

    const isLiked = await Like.findOne(
        {
            likedBy : req.user?._id,
            comment : commentId
        }
    )

    if(isLiked) {
        await Like.findByIdAndDelete(isLiked?._id)
        return res
               .status(200)
               .json(new ApiResponse(200,{Liked : false} , "Comment like removed successfully"))
    }

    const likeDocument = await Like.create(
        {
            likedBy : req.user?._id,
            comment : commentId
        }
    )

    if(!likeDocument) {
        throw new ApiError(400,"Like document creation failed")
    }

    return res
            .status(200)
            .json(new ApiResponse(200,{Liked : true} , "Comment liked successfully"))


})

const toggleTweetLike = asyncHandler(async (req, res) => {
    const {tweetId} = req.params

    if(!isValidObjectId(tweetId)) {
        throw new ApiError(400,"Invalid Tweet ID")
    }

    const isLiked = await Like.findOne(
        {
            likedBy : req.user?._id,
            tweet : tweetId
        }
    )

    if(isLiked) {
        await Like.findByIdAndUpdate(isLiked?._id)
        return res
               .status(200)
               .json(new ApiResponse(200,{Liked:false},"Tweet Like removed successfully"))
    }

    const likeDocument = await Like.create(
        {
            likedBy : req.user?._id,
            tweet : tweetId
        }
    )

    if(!likeDocument) {
        throw new ApiError(400,"Like document creation failed")
    }

    return res
           .status(200)
           .json(new ApiResponse(200,{Liked:true},"Tweet liked successfully"))
}
)

const getLikedVideos = asyncHandler(async (req, res) => {
    const LikedVideos = await Like.aggregate([
        {   
            $match : {
                likedBy : new mongoose.Types.ObjectId(req.user?._id),
                video : {$exists : true}
            }
        },
        {
            $lookup : {
                from : "videos",
                localField : "video",
                foreignField : "_id",
                as : "video",
                pipeline : [
                    {
                        $lookup : {
                            from : "users",
                            localField : "owner",
                            foreignField : "_id",
                            as : "owner",
                            pipeline : [
                                {
                                    $project : {
                                        username : 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields : {
                            owner : {
                                $first : "$owner"
                            }
                        }
                    },
                    {
                        $project : {
                            "thumbnail.url" : 1,
                            title: 1,
                            duration : 1,
                            views : 1,
                            owner : 1,
                            createdAt : 1
                        }
                    }
                ]
            }
        },
        {
            $unwind : "$video"
        },
        {
            $sort : {
                createdAt : -1
            }
        }
    ])

    if(!LikedVideos.length) {
        throw new ApiError(400,"No liked videos found")
    }

    return res
           .status(200)
           .json(new ApiResponse(200,LikedVideos,"LikedVideos list fetched successfully"))
})

export {
    toggleCommentLike,
    toggleTweetLike,
    toggleVideoLike,
    getLikedVideos
}