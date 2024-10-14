import { Router } from "express";
import {  getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus} from "../controllers/video.controller.js"

import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router()
router.use(verifyJWT) // Apply verifyJWT middleware to all routes in this file

router
    .route("/")
    .get(getAllVideos)
    .post(upload.fields([
        {
            name: "videoFile",
            maxCount : 1
        },
        {
            name: "thumbnail",
            maxCount : 1
        }
    ]) , publishAVideo)

// all the controllers used in this route needs videoId
router
    .route("/v/:videoId")
    .get(getVideoById)
    .patch(upload.single("thumbnail"),updateVideo)
    .delete(deleteVideo)

router.route("/toggle/publish/:videoId").patch(togglePublishStatus)

export default router