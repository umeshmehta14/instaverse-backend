import { Posts } from "../models/posts.model.js";
import { User } from "../models/user.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const UploadPost = asyncHandler(async (req, res) => {
  const { caption } = req.body;
  const postLocalPath = req?.file?.path;

  const posts = await Posts.find({});
  const users = await User.find({});

  // if (!postLocalPath) {
  //   throw new ApiError(400, "Post file is missing");
  // }

  // const uploadedPost = await uploadOnCloudinary(postLocalPath);

  // if (!uploadedPost?.url) {
  //   throw new ApiError(400, "something went wrong while uploading post");
  // }

  // const post = await Posts.create({
  //   url: uploadedPost?.url,
  //   owner: req?.user?._id,
  //   caption,
  //   publicId: uploadedPost?.public_id,
  // });

  // if (!post) {
  //   throw new ApiError(401, "something went wrong while uploading post");
  // }

  return res
    .status(200)
    .json(new ApiResponse(200, post, "post uploaded successfully"));
});

export { UploadPost };
