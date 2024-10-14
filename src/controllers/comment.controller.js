import mongoose, { isValidObjectId } from "mongoose"
import {Comment} from "../models/comment.model.js"
import {Video} from "../models/video.model.js"
import {Like} from "../models/like.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"


const addComment = asyncHandler(async (req, res) => {
    const {videoId} = req.params
    const {content} = req.body

    if(!isValidObjectId(videoId)) {
        throw new ApiError(400,"Invalid video ID")
    }

    const video = await Video.findById(videoId)
    if(!video) {
        throw new ApiError(400,"Video not found")
    }

    if(!content.trim()) {
        throw new ApiError(400,"No comment added")
    }

    const comment = await Comment.create(
        {
            content,
            owner : req.user?._id,
            video : videoId
        }
    )

    //console.log(comment)

    if(!comment) {
        throw new ApiError(400,"error while commenting")
    }

    return res
           .status(200)
           .json(new ApiResponse(200,comment,"Commented successfully"))
})

const updateComment = asyncHandler(async (req, res) => {
    const {commentId} = req.params
    const {content} = req.body

    if(!isValidObjectId(commentId)) {
        throw new ApiError(400,"Invalid CommentId")
    }

    const comment = await Comment.findById(commentId)
    if(!comment) {
        throw new ApiError(400,"Comment not found")
    }

    if(!content.trim()) {
        throw new ApiError(400,"Empty comment")
    }

    if(comment?.owner?.toString() !== req.user?._id?.toString()) {
        throw new ApiError(400,"Only the owner of this comment can edit the comment")
    }

    updateField = {}

    if(content.trim() && content.trim() !== comment.content.trim()) {
        updateField.content = content
    }

    const updatedComment = await Comment.findByIdAndUpdate(
        commentId,
        {
            $set : updateField
        },
        {new : true}
    )

    if(!updatedComment) {
        throw new ApiError(400,"Comment not found and thus updation failed")
    }

    return res
           .status(200)
           .json(new ApiResponse(200,updatedComment,"Comment updated successfully"))
})

const deleteComment = asyncHandler(async (req, res) => {
    const {commentId} = req.params

    if(!isValidObjectId(commentId)) {
        throw new ApiError(400,"Invalid Comment ID")
    }

    const comment = await Comment.findById(commentId)
    if(!comment) {
        throw new ApiError(400,"Comment not found")
    }

    if(comment?.owner?.toString() !== req.user?._id?.toString()) {
        throw new ApiError(400,"Only the owner of this comment can delete the comment")
    }

    const deletedComment = await Comment.findByIdAndDelete(commentId)
    if(!deletedComment) {
        throw new ApiError(400,"comment wasn't found and thus deletion failed")
    }

    const commentLikeDocuments = await Like.deleteMany(
        {
            comment : commentId
        }
    )
    // console.log(commentLikeDocuments)

    if(!commentLikeDocuments) {
        throw new ApiError(400,"Failed to delete like documents corresponding to the comment")
    }

    return res
           .status(200)
           .json(new ApiResponse(200,{deletedComment : deletedComment},"Comment deleted successfully"))
})

const getVideoComments = asyncHandler(async (req, res) => {
    const {videoId} = req.params
    const {page = 1, limit = 10} = req.query
    
    if(!isValidObjectId(videoId)) {
        throw new ApiError(400,"Invalid VIdeo Id")
    }

    const video = await Video.findById(videoId)
    if(!video) {
        throw new ApiError(400,"Video not found")
    }

    const videoComments = Comment.aggregate([
        {
            $match : {
                video : new mongoose.Types.ObjectId(videoId)
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
                            coverImage : 1
                        }
                    }
                ]
            }
        },
        {
            $lookup : {
                from : "likes",
                localField : "_id",
                foreignField : "comment",
                as : "commentLikes"
            }
        },
        {
            $addFields : {
                owner : {
                    $first : "$owner"
                },
                totalLikes : {
                    $size : "$commentLikes"
                },
                isLiked : {
                    $cond : {
                        if : {$in : [req.user?._id,"$commentLikes.likedBy"]},
                        then : true,
                        else : false
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
                owner : 1,
                createdAt : 1,
                totalLikes : 1,
                isLiked : 1
            }
        }
    ])

    const options = {
        page : parseInt(page,10),
        limit : parseInt(limit,10)
    }

    Comment.aggregatePaginate(videoComments,options)
    .then(fetchedComments => {
        if(fetchedComments?.docs?.length === 0) {
            return res.status(200).json(new ApiResponse(200,{},"No comments found"))
        } 

        return res
               .status(200)
               .json(new ApiResponse(200,{commentDocuments : fetchedComments.docs,
                                          totalComments : fetchedComments.totalDocs,
                                          currentPage : fetchedComments.page,
                                          totalPages : fetchedComments.totalPages,
                                          nextPage : fetchedComments.nextPage} , 
                                        "Comments fetched successfully"))
    }).catch(error => {
        console.log("Error : ",error)
        throw new ApiError(500,error?.message || "Internal server error while fetching comments")
    })

})

export {
    getVideoComments, 
    addComment, 
    updateComment,
     deleteComment
    }