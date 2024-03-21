import { Posts } from "../models/posts.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const UploadPost = asyncHandler(async (req, res) => {
  const { caption } = req.body;
  const postLocalPath = req?.file?.path;

  if (!postLocalPath) {
    throw new ApiError(400, "Post file is missing");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(400, "something went wrong while uploading post");
  }

  const post = await Posts.create({
    url: avatar?.url,
    owner: req?.user?._id,
    caption,
    publicId: avatar?.public_id,
  });

  if (!post) {
    throw new ApiError(401, "something went wrong while uploading post");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, post, "post uploaded successfully"));
});

export { UploadPost };
