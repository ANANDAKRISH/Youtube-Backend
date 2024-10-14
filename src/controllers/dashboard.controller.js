import mongoose, { isValidObjectId } from "mongoose"
import {Video} from "../models/video.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const getChannelStats = asyncHandler(async (req, res) => {
    
    const channelStats = await Video.aggregate([
        {
            $match : {
                owner : new mongoose.Types.ObjectId(req.user?._id)
            }
        },
        {
            $lookup : {
                from : "likes",
                localField : "_id",
                foreignField : "video",
                as : "likeDocs"
            }
        },
        {  
            $lookup : {
                from : "subscriptions",
                localField : "owner",
                foreignField : "channel",
                as : "subscriptionDocs"
            }
        },
        {   
            $lookup : {
                from : "subscriptions",
                localField : "owner",
                foreignField : "subscriber",
                as : "channelsSubscribedTo"
            }
        },
        {
            $lookup : {
                from : "comments",
                localField : "_id",
                foreignField : "video",
                as : "videoCommentDocs"
            }
        },
        {   
            $lookup : {
                from : "tweets",
                localField : "owner",
                foreignField : "owner",
                as : "tweetDocs"
            }
        },
        { 
            $lookup : {
                from : "playlists",
                localField : "owner",
                foreignField : "owner",
                as : "playlistDocs"
            }
        },
        {
            $group : {
                _id : null,
                totalVideos : { $sum : 1},
                totalViews : {$sum : "$views"},
                subscribers : {$first : "$subscriptionDocs"},
                subcribedTo : {$first : "$channelsSubscribedTo"},
                totalLikes : {$sum : {$size : "$likeDocs"}},
                totalComments : {$sum : {$size : "$videoCommentDocs"}},
                tweetDocuments : {$first : "$tweetDocs"} ,
                playlistDocuments : {$first : "$playlistDocs"}
            }
        },
        {
            $project : {
                _id : 0,
                totalVideos : 1,
                totalViews : 1,
                subscribers: 1,
                subcribedTo : 1,
                totalSubscribers : {$size : "$subscribers"},
                totalChannelsSubscribedTo : {$size : "$subcribedTo"},
                totalLikes : 1,
                totalComments : 1,
                totalTweets : {$size : "$tweetDocuments"},
                totalPlaylists : {$size : "$playlistDocuments"}
            }
        }
        
    ])

    if(!channelStats.length) {
        throw new ApiError(400,"No videos found for this channel")
    }

    return res
           .status(200)
           .json(new ApiResponse(200,channelStats[0],"Successfully calculated all the required channel stats"))

})

const getChannelVideos = asyncHandler(async (req, res) => {
    const videos = await Video.aggregate([
        {
            $match : {
                owner : new mongoose.Types.ObjectId(req.user?._id)
            }
        },
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
                            fullName : 1,
                            avatar : 1
                        }
                    }
                ]
            }
        },
        {
            $unwind : "$owner"
        },
        {
            $addFields : {
                createdAt : {
                    $dateToParts : {
                        date : "$createdAt"
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
                title : 1,
                description : 1,
                duration : 1,
                views : 1,
                isPublished : 1,
                owner : 1,
                thumbnail :1,
                createdAt : {
                    year : 1,
                    month : 1,
                    day : 1
                }
            }
        }

    ])

    if(!videos.length) {
        throw new ApiError(400,"No videos found")
    }

    return res
           .status(200)
           .json(new ApiResponse(200,videos,"Videos fetched successfully"))
})

export {
    getChannelStats, 
    getChannelVideos
    }



    