import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import mongoose from "mongoose"


const healthcheck = asyncHandler(async (req, res) => {
    try{
        const dbStatus = mongoose.connection.readyState ? "DB Connected" : "Not Connected To DB"
        const serverStatus = req.socket.server._listening ? 
        `Server is running on port ${req.socket.server.address().port}` : "Server is not listening"

        const healthStatus = {
            dbStatus,
            serverStatus,
            uptime : process.uptime(),
            message : "OK",
            timestamp : Date.now(),
            hrtime : process.hrtime(),
        }

        return res
               .status(200)
               .json(new ApiResponse(200,healthStatus,"Health check successfully done"))
    } catch(error) {
        const healthStatus = {
            dbStatus : "Unknown - Error occurred during health check",
            uptime : process.uptime(),
            message : "Error",
            timestamp : Date.now(),
            hrtime : process.hrtime(),
            error : error?.message,
            serverStatus : "Unknown - Error occurred during health check"
        }       

        console.error("Error in health check : " , error)
        return res
               .status(500)
               .json(new ApiResponse(500,healthStatus,"Health check failed"))
    }
})

export {
    healthcheck
    }
    