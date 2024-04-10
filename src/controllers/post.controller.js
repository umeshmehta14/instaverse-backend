import { postFolder } from "../constants.js";
import { Posts } from "../models/posts.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  deleteFromCloudinary,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";

const UploadPost = asyncHandler(async (req, res) => {
  const { caption } = req.body;
  const postLocalPath = req?.file?.path;

  if (!postLocalPath) {
    throw new ApiError(400, "Post file is missing");
  }
  if (!caption) {
    throw new ApiError(400, "Caption is missing");
  }

  const uploadedPost = await uploadOnCloudinary(postLocalPath, postFolder);

  if (!uploadedPost?.url) {
    throw new ApiError(400, "something went wrong while uploading post");
  }

  const post = await Posts.create({
    url: uploadedPost?.url,
    owner: req?.user?._id,
    caption,
    publicId: uploadedPost?.public_id,
  });

  if (!post) {
    throw new ApiError(401, "something went wrong while uploading post");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, post, "post uploaded successfully"));
});

const deletePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { publicId } = req.body;
  if (!postId) {
    throw new ApiError(400, "post is required");
  }
  const deletedPost = await Posts.findByIdAndDelete({ _id: postId });
  if (!deletedPost) {
    throw new ApiError(400, "Something went wrong while deleting post");
  }
  await deleteFromCloudinary(publicId, postFolder);
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "post deleted successfully"));
});

const editPost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { caption } = req.body;

  if (!caption) {
    throw new ApiError(400, "caption required");
  }

  const updatedPost = await Posts.findByIdAndUpdate(
    postId,
    { caption },
    { new: true }
  );

  if (!updatedPost) {
    throw new ApiError(404, "Post not found");
  }

  res
    .status(200)
    .json(new ApiResponse(200, updatedPost, "Post updated successfully"));
});

const getAllPost = asyncHandler(async (req, res) => {
  const posts = await Posts.find({}).sort({ createdAt: -1 });
  return res
    .status(200)
    .json(new ApiResponse(200, posts, "Posts fetched successfully"));
});

export { UploadPost, deletePost, editPost, getAllPost };
