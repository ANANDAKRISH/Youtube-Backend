import { asyncHandler } from "../utils/asyncHandler.js"
import { Video } from "../models/video.model.js"
import { User } from "../models/user.model.js"
import { Like } from "../models/like.model.js"
import { Comment } from "../models/comment.model.js"
import { Playlist } from "../models/playlist.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import mongoose,{ isValidObjectId } from "mongoose"
import { deleteFromCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js"
import { upload } from "../middlewares/multer.middleware.js"
import { getWatchHistory } from "./user.controller.js"


const getAllVideos = asyncHandler(async (req,res) => {
    const {page = 1 , limit = 10 , query , sortBy , sortType , userId} = req.query
    const pipeline = []
    
    // search index we have created is 'search-videos'
    if(query.trim() === "") {
        // This ensures that the user has provided a non-empty search term.
        throw new ApiError (400 , "Provide a valid query")
    } else {
        pipeline.push(
            {
                $search : {
                    index : "search-videos",
                    text : {
                        query: query,
                        path : ["title","description"]
                    }
                }
            }
        )
    }
    
    if(userId) {
        // all parameters from req.query are initially strings. The isValidObjectId() function is designed to work with string inputs
        // It doesn't need to convert the string to an ObjectId before checking. It actually checks if the string could be a valid ObjectId.
        
        if(!isValidObjectId(userId)){
            throw new ApiError(400 , "Invalid userId")
        } 

        pipeline.push({
            $match : {
                owner : new mongoose.Types.ObjectId(userId)
            }
        })
    } // even if userId is not provided by user it's fine as it's not a mandatory filter and thus no need of else case

    pipeline.push({
        $match : {
            isPublished : true
        }
    })

    // whhether or not userId is provided , we need to collect the owner details of the video document as the owner field in video
    // document contains only the objectID corresponding to the owner property,  details of which are present as user document
    pipeline.push(
    {
        $lookup : {
            from: "users",
            localField : "owner",
            foreignField : "_id",
            as : "owner",
            pipeline: [
                {
                    $project : {
                        username : 1,
                        fullName :  1,
                        "avatar.url" : 1
                    }
                }
            ]
        }
    } , 
    {
        $addFields : {
            owner : {
                $first : "$owner"
            }
        }
    })

    // If the name of the new field is the same as an existing field name (including the _id field ), 
    // $addFields overwrites the existing value of that field with the value of the specified expression.
    
    // sorting can be based on views , duration , createdAt
    if(sortBy && sortType) {
        pipeline.push({
            $sort : {
                [sortBy] : sortType === "asc" ? 1 : -1
            }
        })
    } else{
        pipeline.push({
            $sort : {
                createdAt : -1
            }
        })
    }
    
    // default cases are used as 1st query serach may not have filters and also could be helpful when user doesnt use filters
    
    // pagination code
    const videoAggregate = Video.aggregate(pipeline)
    const options = {
        page : parseInt(page,10),
        limit : parseInt(limit,10)
    }


    Video.aggregatePaginate(videoAggregate,options)
    .then(fetchedVideos => {
        if(fetchedVideos?.docs?.length === 0) {
            return res.status(200).json(new ApiResponse(200,{},"No videos found"))
        } // If nothing matches the query

        return res.status(200)
                  .json(new ApiResponse(200,{videoDocuments : fetchedVideos.docs,
                                            totalVideos : fetchedVideos.totalDocs,
                                            currentPage : fetchedVideos.page,
                                            totalPages : fetchedVideos.totalPages,
                                            nextPage : fetchedVideos.nextPage } ,
                                        "Vidoes Fetched Succcessfully"))

    // actually we can directly return fetchedVideos as data and fetch whatever we need from frontend , but this above 
    // approach will be more useful for frontend developers
    }).catch(error => {
        console.log("Error :", error)
        throw new ApiError(500 , error?.message || "Internal server error while fetching videos")
        
    })

    
})

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description} = req.body

    if([title,description].some((field) => field?.trim() === "")) {
        throw new ApiError(400 , "Title & Description are required fields")
    }

    const videoFileLocalPath = req.files?.videoFile?.[0]?.path
    const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path

    if(!(videoLocalPath && thumbnailLocalPath)) { // (!videoLocalPath || !thumbnailLocalPAth)
        throw new ApiError(400,"Video or Thumbnail is missing. Both are required fields")
    }

    const videoFile = await uploadOnCloudinary(videoFileLocalPath)
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)

    // console.log(videoFile);
    // console.log(thumbnail);

    if(!videoFile) {
        throw new ApiError(400,"Failed to upload the video file")
    }

    if(!thumbnail) {
        throw new ApiError(400,"Failed to upload the thumbnail image")
    }

    const video = await Video.create({
        title,
        description,
        duration : videoFile?.duration, // directly available from cloudinary
        videoFile : {
            url : videoFile?.url,
            public_id : videoFile?.public_id
        },
        thumbnail : {
            url : thumbnail?.url,
            public_id : thumbnail?.public_id
        },
        owner : req.user?._id,
        isPublished : false
    })

    const uploadedVideo = await Video.findById(video._id) // just verifying to see if the document is actually registered in DB

    if(!uploadedVideo) {
        throw new ApiError(400,"Video doesn't exist")
    }

    return res
          .status(200)
          .json(new ApiResponse(200,uploadedVideo,"Video published successfully"))

})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params 

    if(!isValidObjectId(videoId)) {
        throw new ApiError(400,"Invalid Video Id")
    }

    const video = await Video.aggregate([
        {
            $match : {
                _id : new mongoose.Types.ObjectId(videoId)
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
                        $lookup : {
                            from : "subscriptions",
                            localField : "_id",
                            foreignField : "channel",
                            as : "subscribers"
                        }
                    } , 
                    {
                        $addFields : {
                            subscriberCount : {
                                $size : "$subscribers"
                            }
                        }
                    },
                ]
            }
        },

        {
           $lookup : {
              from : "likes",
              localField : "_id", // videoId
              foreignField : "video",
              as: "likesGiven"
           } 
        } ,

        {
            $addFields : {
                likesCount : {
                    $size : "$likesGiven"
                },
                isLiked : {
                    $cond : {
                        if : {$in : [req.user?._id , "$likesGiven.likedBy"]},
                        then : true,
                        else: false
                    }
                } ,
                isSubscribed : {
                    $cond : {
                        //subscribers field comes from the nested lookup sitting in the user collection (owner is the actual field in video document , thus we use owner.subscribers)
                        if: {$in : [req.user?._id , "$owner.subscribers.subscriber"]}, 
                        then : true,
                        else : false
                    }
                } ,
                owner : {
                    $first : "$owner"
                }
            }
        } ,

        {
            $project : {
                "videoFile.url" : 1,
                title: 1,
                description : 1,
                duration : 1,
                views : 1,
                "owner.username" : 1,
                "owner.fullName" : 1,
                "owner.avatar" : 1,
                "owner.subscriberCount" : 1,
                likesCount : 1,
                isLiked : 1,
                isSubscribed : 1,
                createdAt : 1
            }
        }

    ])

    if(!video.length) {
        throw new ApiError(400,"Video not found")
    }

    // Increment views only if video is fetched successfully , that's why we keep this code at last
    await Video.findByIdAndUpdate(
        videoId,
        {
            $inc : {
                views : 1
            }
        }
    )

    // Add this video to userWatchHistory only if video is fetched successfully , that's why we keep this code at last
    await User.findByIdAndUpdate(
        req.user?._id,
        {
            $addToSet : {
                watchHistory : videoId
            }
        }
    )
   
    
    return res
           .status(200)
           .json(new ApiResponse(200,video[0],"Video details fetched successfully" ))
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params 

    if(!isValidObjectId(videoId)) {
        throw new ApiError(400,"Invalid video ID")
    }

    const video = await Video.findById(videoId)
    if(!video) {
        throw new ApiError(400,"Video not found")
    }
  
    const {title,description} = req.body
    const thumbnailLocalPath = req.file?.path // req.file is an object containing info about uploaded file
    // console.log(req.file)
   
    const updateFields = {}

    if(title.trim() && title.trim() !== video.title.trim()) {
        updateFields.title = title.trim()
    }

    if(description.trim() && description.trim() !== video.description.trim()) {
        updateFields.description = description.trim()
    }

    if(thumbnailLocalPath) {

        const thumbnail= await uploadOnCloudinary(thumbnailLocalPath)
        if(!thumbnail) {
            throw new ApiError(400,"Problem while uploading the image")
        }

        // After new thumbnail is successfully uploaded to cloudinary , we can delete the old thumbnail
        const oldThumbnailUrl = video.thumbnail?.url
        if(oldThumbnailUrl) { 
            await deleteFromCloudinary(oldThumbnailUrl)
        }

        updateFields.thumbnail = {
            url : thumbnail?.url,
            public_id : thumbnail?.public_id
        }
    }
    
    // When no changes are made & clicked save button
    if(Object.keys(updateFields).length === 0) {
        return res
            .status(200)
            .json(new ApiResponse(200 , video , "No changes were made to the video details"))
    }


    const updatedVideo = await Video.findByIdAndUpdate(
        videoId,
        {
            // if any field not changed ,it wont even be a part of updateFields object and thus blank fields wont be there
            $set : updateFields 
        } ,
        {new : true}
    )

    if(!updatedVideo) {
        //if update failed due to some reason , we remove the file from cloudinary
        await deleteFromCloudinary(thumbnail?.url) 
        throw new ApiError(400,"Update failed")
    }
    
    return res
           .status(200)
           .json(new ApiResponse (200 , updatedVideo , "Successfully updated the video details "))

})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    if(!isValidObjectId(videoId)) {
        throw new ApiError(400,"Invalid VideoID")
    }

    const video = await Video.findById(videoId)
    if(!video) {
        throw new ApiError(400,"VIdeo not found")
    }

    // Delete thumbnail & video from cloudinary
    const cloudinaryDeletions = []
    if(video.thumbnail?.url) {
        cloudinaryDeletions.push(deleteFromCloudinary(video.thumbnail?.url))
    }

    if(video.videoFile?.url) {
        cloudinaryDeletions.push(deleteFromCloudinary(video.videoFile?.url))
    }
    
    // wait for cloudinary operations to complete
    await Promise.all(cloudinaryDeletions)

    // Delete the video document & perform cleanup operations concurrently. These cleanup opeartions are:
    // deleting all Like documents where the video field matches the videoId of the deleted video
    // deleting all Comment documents where the video field matches the videoId of the deleted video
    // removing video from watch history of all users who have seen this video
    // removing video from all the playlist documents
    const [deletedVideo , likesDeletion , commentsDeletion , watchHistoryUpdate , playlistUpdate] = await Promise.all([
        Video.findByIdAndDelete(videoId) ,
        Like.deleteMany({
            video : videoId // video is a field in Like model
        }),
        Comment.deleteMany({
            video: videoId // video is a field in comment model
        }),
        User.updateMany(
            {
                watchHistory : videoId
            } ,
            {
                $pull : {
                    watchHistory : videoId
                }
            }
        ) ,
        Playlist.updateMany(
            {
                videos : videoId
            } ,
            {
                $pull : {
                    videos : videoId
                }
            }
        )
    ])
    
    console.log(`Deleted ${likesDeletion.deletedCount} likes documents & ${commentsDeletion.deletedCount} comments documents`)
    console.log(`Updated ${watchHistoryUpdate.modifiedCount} user's watchhistories & ${playlistUpdate.modifiedCount} playlist docs`)


    if(!deletedVideo) {
        throw new ApiError(400,"Video not found")
    }
    
    return res
           .status(200)
           .json(new ApiResponse(200,{},"Video deleted successfully"))

})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    if(!isValidObjectId(videoId)){
        throw new ApiError(400,"Invalid VIdeo ID")
    }
    
    const video = await Video.findById(videoId)
    if(!video) {
        throw new ApiError(400,"Video not found")
    }

    const toggledVideo = await Video.findByIdAndUpdate(
        videoId,
        {
            $set : {
                isPublished : !video?.isPublished
            }
        },
        {new:true}
    )

    if(!toggledVideo) {
        throw new ApiError(404,"Video not found & thus no updates made") 
    }

    return res
           .status(200)
           .json(new ApiResponse(200,toggledVideo,"Publish status toggled successfully"))
})

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}










