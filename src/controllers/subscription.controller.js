import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import mongoose, { isValidObjectId } from "mongoose"
import { Subscription } from "../models/subscription.model.js"
import { User } from "../models/user.model.js"

const toggleSubscription = asyncHandler(async (req, res) => {
    const {channelId} = req.params 

    if(!isValidObjectId(channelId)) {
        throw new ApiError(400,"Invalid Channel ID")
    }

    const isSubscribed = await Subscription.findOne({
        subscriber : req.user._id,
        channel : channelId
    })

    if(isSubscribed) {
       await Subscription.findByIdAndDelete(isSubscribed?._id)
       return res
                .status(200)
                .json(new ApiResponse(200,{Subscribed: false},"Channel Unsubscribed successfully"))
    } 

    const subscriptionDocument = await Subscription.create({
        subscriber : req.user?._id,
        channel : channelId
    })
    
    if(!subscriptionDocument) {
        throw new ApiError(500,"Document creation failed")
    }

    return res
            .status(200)
            .json(200,{Subscribed : true} , "Channel Subscribed successfully")
    
})

const getUserChannelSubscribers = asyncHandler(async (req, res) => {
    const {channelId} = req.params
    
    if(!isValidObjectId(channelId)) {
        throw new ApiError(400,"Invalid Channel ID")
    }

    const subscribers = await Subscription.aggregate([
        {
            $match : {
                channel : new mongoose.Types.ObjectId(channelId)
            }
        } ,
        {
            $lookup : {
                from : "users",
                localField :"subscriber",
                foreignField : "_id",
                as : "subscriber",
                pipeline : [
                    {
                        $lookup : {
                            from : "subscriptions",
                            localField : "_id",
                            foreignField : "channel",
                            as: "subscribedToSubscriber"
                        }
                    },
                    {
                        $addFields : {
                            subscribedToSubscriber : {
                                $cond : {
                                    if : {
                                        $in : [channelId,"$subscribedToSubscriber.subscriber"]
                                    },
                                    then : true,
                                    else : false
                                }
                            },
                            subscribersCount : {
                                $size : "$subscribedToSubscriber"
                            }
                        }
                    }
                ]
            }
        },
        {
            $unwind : "$subscriber"
        },
        {
            $project : {
                _id : 0,
                subscriber : {
                    _id : 1,
                    username : 1,
                    fullName : 1,
                    "avatar.url" : 1,
                    subscribedToSubscriber : 1,
                    subscribersCount : 1
                }
            }
        }
    ])

    if(!subscribers?.length) {
      throw new ApiError(400,"No subscribers found")
    }

    const subscribersList = subscribers.map(item => item.subscriber)

    return res
            .status(200)
            .json(new ApiResponse(200,subscribersList,"List of subscribers fetched successfully"))

})

const getSubscribedChannels = asyncHandler(async (req, res) => {
    const { subscriberId } = req.params

    if(!isValidObjectId(subscriberId)) {
        throw new ApiError(400,"Inavlid Subscriber ID")
    }

    const channels = await Subscription.aggregate([
        {
            $match : {
                subscriber : new mongoose.Types.ObjectId(subscriberId)
            }
        },
        {
            $lookup : {
                from : "users",
                localField : "channel",
                foreignField : "_id",
                as : "subscribedChannel",
                pipeline : [
                    {
                        $lookup : {
                            from : "video",
                            localField : "_id",
                            foreignField : "owner",
                            as: "allVideos"
                        }
                    },
                    {
                        $addFields : {
                            latestVideo : {
                                $last : "$allVideos"
                            }
                        }
                    }
                ]
            }
        },
        {
            $unwind : "$subscribedChannel"
        },
        {
            $project : {
                _id: 0,
                subscribedChannel : {
                    _id : 1,
                    username : 1,
                    fullName : 1,
                    "avatar.url" : 1,
                    latestVideo : {
                        "videoFile.url" : 1,
                        "thumbnail.url" :1,
                         title : 1,
                         description : 1
                    }

                }
            }
        }
    ])

    if(!channels?.length) {
        throw new ApiError(400,"No subscribed channels found")
    }

    const channelsList = channels.map(item => item.channel)

    return res
           .status(200)
           .json(new ApiResponse(200,channelsList,"List of channnels fetched successfully"))
})

export {
    toggleSubscription,
    getSubscribedChannels,
    getUserChannelSubscribers
}