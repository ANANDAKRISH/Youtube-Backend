import { Router } from "express";
import {
    getVideoComments, 
    addComment, 
    updateComment,
     deleteComment
    } from '../controllers/comment.controller.js'

import { verifyJWT } from "../middlewares/auth.middleware.js"

const router = Router()
router.use(verifyJWT)

router.route("/add/:videoId").post(addComment)
router
    .route("/modify/:commentId")
    .patch(updateComment)
    .delete(deleteComment)

router.route("/:videoId").get(getVideoComments)

export default router