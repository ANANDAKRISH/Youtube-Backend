import connectDB from "./db/db_connection.js"
import dotenv from "dotenv"

dotenv.config({
    path: './env'
})

connectDB()