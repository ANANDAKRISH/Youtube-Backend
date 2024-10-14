import { Router } from "express";
import {
    createTweet,
    getUserTweets,
    updateTweet,
    deleteTweet
} from '../controllers/tweet.controller.js'

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router()
router.use(verifyJWT)

router.route("/").post(createTweet)
router
     .route("/modify/:tweetId")
     .patch(updateTweet)
     .delete(deleteTweet)
     
router.route("/user/:userId").get(getUserTweets)

export default router
