import mongoose, {isValidObjectId} from "mongoose"
import {Playlist} from "../models/playlist.model.js"
import {Video} from "../models/video.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const createPlaylist = asyncHandler(async (req, res) => {
    const {name, description} = req.body

    if( [name,description].some( (field) => field?.trim()==="" ) ) {
        throw new ApiError(404,"Both fields are required")
    }

    const playlist = await Playlist.create({
        name,
        description,
        owner : req.user?._id
    })

    const createdPlaylist = await Playlist.findById(playlist._id)

    if(!createdPlaylist) {
        throw new ApiError(500,"Failed to create playlist")
    }

    return res
           .status(200)
           .json(new ApiResponse(200 , createdPlaylist , "Playlist created successfully"))
})

const addVideoToPlaylist = asyncHandler(async (req, res) => {
    const {playlistId, videoId} = req.params

    if(!(isValidObjectId(playlistId) && isValidObjectId(videoId))) {
        throw new ApiError(404,"Inavlid videoId or PlaylistId")
    }

    const playlist = await Playlist.findById(playlistId)
    const video = await Video.findById(videoId)

    if(!playlist) {
        throw new ApiError(404,"Playlist not found")
    }

    if(!video) {
        throw new ApiError(404,"Vidoe not found")
    }

    if(!video.isPublished) {
        throw new ApiError(404,"Unpublished video cannot be added to the playlist")
    }
    
    if( (playlist.owner?.toString() && video.owner?.toString()) !== req.user?._id.toString() ) {
        throw new ApiError(404,"You are not authorized to update this playlist. Only the owner can do it")
    } // additional protective layer

    const updatedPlaylist = await Playlist.findByIdAndUpdate(
        playlistId,
        {
            $addToSet : {
                videos : videoId
            }
        },
        {new : true}
    )

    if(!updatedPlaylist) {
        throw new ApiError(404,"Video not found & thus failed to add video to playlist")
    }

    return res
           .status(200)
           .json(new ApiResponse (200,updatedPlaylist,"Video added to playlist successfully"))

})

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
    const {playlistId, videoId} = req.params

    if(!(isValidObjectId(playlistId) && (isValidObjectId(videoId)))) {
        throw new ApiError(400,"Invalid playlistId or videoId")
    }

    const playlist = await Playlist.findById(playlistId)
    const video = await Video.findById(videoId)

    if(!playlist) {
        throw new ApiError(400,"Playlist not found")
    }

    if(!video) {
        throw new ApiError(400,"Video not found")
    }

    if((playlist.owner?.toString() && video.owner?.toString()) !== req.user?._id.toString()) {
        throw new ApiError(404,"You are not the owner of the video/playlist and thus do not have the access to delete it")
    }

    if(!playlist.video.includes(videoId)) {
        throw new ApiError(400,"The video doesn't exist in this playlist")
    }

    const updatedPlaylist = await Playlist.findByIdAndUpdate(
        playlistId,
        {
            $pull : {
                videos : videoId
            }
        } ,
        {new : true}
    )

    if(!updatedPlaylist) {
        throw new ApiError(404,"Playlist not found and thus updates not made")
    }

    return res
           .status(200)
           .json(new ApiResponse(200,updatedPlaylist,"Video deleted from playlist successfully"))

})

const deletePlaylist = asyncHandler(async (req, res) => {
    const {playlistId} = req.params
    
    if(!isValidObjectId(playlistId)) {
        throw new ApiError(404,"Invalid Playlist Id")
    }

    const playlist = await Playlist.findById(playlistId)
    if(!playlist) {
        throw new ApiError(404,"Playlist not found")
    }

    if(playlist.owner?.toString() !== req.user?._id.toString()) {
        throw new ApiError(404,"You are not the owner and thus not authorized to delete the playlist")
    }

    const deletedPlaylist = await Playlist.findByIdAndDelete(playlistId)

    if(!deletedPlaylist) {
        throw new ApiError(404,"Playlist not found and thus not deleted")
    }

    return res
           .status(200)
           .json(new ApiResponse(200, {deletedPlaylist : playlist} ,"Playlist deleted Successfully"))
})

const updatePlaylist = asyncHandler(async (req, res) => {
    const {playlistId} = req.params
    const {name, description} = req.body
    
    if(!isValidObjectId(playlistId)) {
        throw new ApiError(400,"Invalid Playlist Id")
    }

    const playlist = await Playlist.findById(playlistId)
    if(!playlist) {
        throw new ApiError(400,"Playlist not found")
    }

    if(playlist.owner?.toString() !== req.user?._id.toString()) {
        throw new ApiError(400,"Only the owner of the playlist can edit the playlist")
    }

    if( !(name.trim() || description.trim()) ) {
        throw new ApiError(400,"Atleast one field must be provided for update")
    }
    
    const updateFields = {}
    
    // If field values are unchanged there is no point in simply updating the same thing
    if(name.trim() && name.trim() !== playlist.name.trim() ) {
        updateFields.name = name.trim() 
    }

    if(description.trim() && description.trim() !== playlist.description.trim()) {
        updateFields.description = description.trim()
    }

    const updatedPlaylist = await Playlist.findByIdAndUpdate(
        playlistId,
        {
            $set : updateFields
        },
        {new : true}
    )

    if(!updatedPlaylist) {
        throw new ApiError(404,"Playlist not found and thus not updated")
    }

    return res
           .status(200)
           .json(new ApiResponse(200,updatedPlaylist,"Playlist details updated successfully"))
})

const getPlaylistById = asyncHandler(async (req, res) => {
    const {playlistId} = req.params
    
    if(!isValidObjectId(playlistId)) {
        throw new ApiError("Invalid PlaylistId")
    }

    const playlist = await Playlist.findById(playlistId)
    if(!playlist) {
        throw new ApiError(404,"Playlist not found")
    }
    
    const playlistDetails = await Playlist.aggregate([
        {
            $match : {
                _id : new mongoose.Types.ObjectId(playlistId)
            }
        },
        {
            $lookup : {
                from : "videos", // videos collection
                localField : "videos", // videos field in playlist document
                foreignField : "_id",
                as: "videos", 
                pipeline : [
                    {
                        $lookup : {
                            from : "users",
                            localField : "owner",
                            foreignField : "_id",
                            as : "owner",
                        }
                    } , 
                    {
                        $addFields : {
                            owner : {
                                $first : "$owner"
                            }
                        }
                    },
                ]
            }
        } ,
        {
            $lookup : {
                from : "users",
                localField : "owner",
                foreignField : "_id",
                as : "playlistOwner"
            }
        },
        {
            $addFields : {
                playlistOwner : {
                    $first : "$playlistOwner"
                } , 
                totalVideoCount : {
                    $size : "$videos"
                },
                totalPlaylistViews : {
                    $sum : "$videos.views"
                }
            }
        } ,
        {
            $project : {
                name : 1,
                description : 1,
                createdAt : 1,
                updatedAt : 1,
                playlistOwner : {
                    username : 1,
                    email : 1,
                    fullName: 1,
                    avatar : 1
                },
                videos : {
                        title: 1,
                        duration : 1,
                        thumbnail : 1,
                        views : 1,
                        owner : {
                            username : 1,
                            fullName : 1
                        }
                    },
                totalPlaylistViews : 1,
                totalVideoCount : 1
            }
        }
    ])

    if(!playlistDetails.length) {
        throw new ApiError(404,"Playlist not found")
    }
    
    // this handles the case where a playlist is created by the owner but not a single video is added to that playlist
    if(playlistDetails[0].videos?.length === 0) {
        return res
               .status(200)
               .json(new ApiResponse(200,
                {
                    playlistName : playlistDetails[0].name,
                    playlistDescription : playlistDetails[0].description,
                    playlistOwner : playlistDetails[0].playlistOwner,
                    playlistVideoCount : playlistDetails[0].totalVideoCount,
                    messageToDisplay : "Playlist is empty"
                },
                "Playlist is empty"))
    }

    return res
           .status(200)
           .json(new ApiResponse(200,playlistDetails[0],"Playlist fetched successfully"))
})

const getUserPlaylists = asyncHandler(async (req, res) => {
    const {userId} = req.params

    if(!isValidObjectId(userId)) {
        throw new ApiError(404,"Invalid user ID")
    }
    
    const userPlaylists = await Playlist.aggregate([
        {
            $match : {
                owner : new mongoose.Types.ObjectId(userId)
            }
        },
        {
            $lookup : {
                from : "videos",
                localField : "videos",
                foreignField : "_id",
                as : "videos"
            }
        },
        {
            $addFields : {
                totalPlaylistVideos : {
                    $size : "$videos"
                },
                firstVideoThumbnail : {
                    $cond : {
                        if : {$gt : [{$size : "$videos"} ,0] },
                        then : {$arrayElemAt : ["$videos.thumbnail" , 0]},
                        else : null
                    }
                }
            }
        },
        {
            $project : {
                name : 1,
                totalPlaylistVideos : 1,
                updatedAt : 1,
                firstVideoThumbnail : 1
            }
        }
    ])

    if(!userPlaylists.length) {
        throw new ApiError(404,"No playlist found")
    }

    return res
           .status(200)
           .json(new ApiResponse(200,userPlaylists,"User playlists fetched successfully"))
 
})



export {
    createPlaylist,
    getUserPlaylists,
    getPlaylistById,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
    deletePlaylist,
    updatePlaylist
}