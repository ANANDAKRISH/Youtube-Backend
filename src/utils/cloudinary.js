import {v2 as cloudinary} from "cloudinary"
import fs from "fs"

cloudinary.config({
     cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
     api_key: process.env.CLOUDINARY_API_KEY,
     api_secret: process.env.CLOUDINARY_API_SECRET
})

const uploadOnCloudinary = async (localFilePath) => {
     try{
          if(!localFilePath) {
               console.log('Invalid FIle Path')
               return null
          }

          const response = await cloudinary.uploader.upload(localFilePath, {
               resource_type: "auto"
          })

          // console.log(`The file has been uploaded successfully on cloudinary: ${response.url}`)
          // console.log("Whole response : ", response)

          fs.unlinkSync(localFilePath)
          return response

     } catch(error){
          fs.unlinkSync(localFilePath)
          console.log(`The following error has occured during the upload operation : ${error}`);
          return null
     }
}

const deleteFromCloudinary = async (url , resourceType = "image") => {
     try {
          const publicId = url.split('/').pop().split('.')[0]
          console.log(`Public Id of the file is : ${publicId}`); // this helps for testing
          await cloudinary.uploader.destroy(publicId , { resource_type: resourceType })
          
     } catch (error) {
          console.log(`The following error occured during deleting the file from cloudinary : ${error}`);
     }
}

export {uploadOnCloudinary , deleteFromCloudinary}
 