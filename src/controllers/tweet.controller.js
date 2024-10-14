import mongoose, { isValidObjectId } from "mongoose"
import {Tweet} from "../models/tweet.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const createTweet = asyncHandler(async (req, res) => {
    const {content} = req.body

    if(!content?.trim()) {
        throw new ApiError(400,"Content field is left empty")
    }

    const tweet = await Tweet.create(
        {
            owner : req.User?._id,
            content : content
        }
    )

    if(!tweet) {
        throw new ApiError(500,"Tweet creation failed")
    }

    return res
           .status(200)
           .json(new ApiResponse(200,tweet,"Tweet created successfully"))
})

const updateTweet = asyncHandler(async (req, res) => {
    const {tweetId} = req.params
    const {content} = req.body

    if(!isValidObjectId(tweetId)) {
        throw new ApiError(400,"Inavlid TweetId")
    }

    if(!content?.trim()) {
        throw new ApiError(400,"Content field missing")
    }

    const tweet = await Tweet.findById(tweetId)

    if(!tweet) {
        throw new ApiError(400,"Tweet not found")
    }

    if(tweet?.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(400,"Only the owner of the tweet can edit it")
    }

    const updateField = {}

    if(content.trim() !== tweet?.content.trim()) {
        updateField.content = content
    }

    const updatedTweet = await Tweet.findByIdAndUpdate(
        tweetId,
        {
          $set : updateField
        },
        {new:true}
    )

    if(!updatedTweet) {
        throw new ApiError(400,"Failed to update the tweet as tweetId couldn't be fetched")
    }

    return res
           .status(200)
           .json(new ApiResponse(200,updatedTweet,"Tweet updated successfully"))

})

const deleteTweet = asyncHandler(async (req, res) => {
    const {tweetId} = req.params

    if(!isValidObjectId(tweetId)){
        throw new ApiError(400,"Inavlid tweet ID")
    }
    
    const tweet = await Tweet.findById(tweetId) 
    if(!tweet) {
        throw new ApiError(400,"Tweet not found")
    }

    if(tweet?.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(400,"Only the owner of the tweet has the permission to delete it")
    }

    const deletedTweet = await Tweet.findByIdAndDelete(tweetId)
    if(!deletedTweet) {
        throw new ApiError(400,"Tweet not found and thus failed to delete")
    }

    return res
           .status(200)
           .json(new ApiResponse(200,{},"Tweet deleted successfully"))

})

const getUserTweets = asyncHandler(async (req, res) => {
    const {userId} = req.params

    if(!isValidObjectId(userId)) {
        throw new ApiError(400,"Invalid User ID")
    }

    const userTweets = await Tweet.aggregate([
        {
            $match : {
                owner : new mongoose.Types.ObjectId(userId)
            }
        } ,
        {
            $lookup : {
                from : "users",
                localField : "owner",
                foreignField : "_id",
                as : "owner",
                pipeline : [
                    {
                        $project : {
                            username : 1,
                            avatar : 1
                        }
                    }
                ]
            }
        },
        {
            $lookup : {
                from : "likes",
                localField : "_id",
                foreignField : "tweet",
                as : "likeDetails",
                pipeline : [
                    {
                        $project : {
                            likedBy : 1
                        }
                    }
                ]
            }
        },
        {
            $addFields : {
                owner : {
                    $first : "$owner"
                } ,
                totalLikes : {
                    $size : "$likeDetails"
                },
                isLiked : {
                    $cond : {
                        if : {$in : [req.user?._id , "$likeDetails.likedBy"]},
                        then : true,
                        else: false
                    }
                }
            }
        },
        {
            $sort : {
                createdAt : -1
            }
        },
        {
            $project : {
                content : 1,
                owner :1,
                totalLikes : 1,
                isLiked: 1,
                createdAt : 1,
            }
        }
    ]) 

    if(!userTweets.length) {
        throw new ApiError(400,"No tweets found for this user")
    }

    return res
           .status(200)
           .json(new ApiResponse(200,userTweets,"User tweets fetched successfully"))

})

export {
    createTweet,
    getUserTweets,
    updateTweet,
    deleteTweet
}