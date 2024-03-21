import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFile, folderName) => {
  try {
    if (!localFile) return null;

    const response = await cloudinary.uploader.upload(localFile, {
      resource_type: "auto",
      folder: folderName,
    });
    fs.unlinkSync(localFile);
    return response;
  } catch (error) {
    fs.unlinkSync(localFile);
    return null;
  }
};

const deleteFromCloudinary = async (publicId, folderName) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      folder: folderName,
    });
    return result;
  } catch (error) {
    return null;
  }
};

const deleteVideoFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.api.delete_resources([publicId], {
      resource_type: "video",
    });
    return result;
  } catch (error) {
    return null;
  }
};

export { deleteFromCloudinary, deleteVideoFromCloudinary, uploadOnCloudinary };
