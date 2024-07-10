import { Router } from "express"
import { loginUser, registerUser ,logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails } from "../controllers/user.controller.js"
import { upload } from "../middlewares/multer.middleware.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"
import { verify } from "jsonwebtoken"


const router = Router()

router.route("/register").post(
    upload.fields([
        {
            name: "avatar",
            maxCount: 1
        },
        {
            name: "coverImage",
            maxCount: 1
        }
    ]),
    registerUser
)

router.route("/login").post(loginUser)

// Secured Routes
router.route("/logout").post(verifyJWT,logoutUser)
router.route("/refresh-token").post(refreshAccessToken)     
router.route("/change-password").poset(verifyJWT,changeCurrentPassword)
router.route("/current-user").get(verifyJWT,getCurrentUser)
router.route("/update-account").post(verifyJWT,updateAccountDetails)

export default router

