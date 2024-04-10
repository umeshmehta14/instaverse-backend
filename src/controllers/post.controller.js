import mongoose, { isValidObjectId } from "mongoose";
import { postFolder } from "../constants.js";
import { Posts } from "../models/posts.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  deleteFromCloudinary,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";
import { User } from "../models/user.model.js";

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
  const page = req.query.page ? parseInt(req.query.page) : 1;
  const perPage = 8;

  const options = {
    page,
    limit: perPage,
    sort: { createdAt: -1 },
  };

  const posts = await Posts.aggregatePaginate([], options);
  if (!posts) {
    throw new ApiError(500, "something went wrong when trying to find posts");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, posts, "Posts fetched successfully"));
});

const getHomePosts = asyncHandler(async (req, res) => {
  const currentUser = req.user;
  const followingUsers = currentUser.following;

  const options = {
    page: req.query.page || 1,
    limit: 8,
    sort: { createdAt: -1 },
  };

  const posts = await Posts.aggregatePaginate(
    [
      {
        $match: {
          $or: [{ owner: { $in: followingUsers } }, { owner: currentUser._id }],
        },
      },
      { $sort: { createdAt: -1 } },
    ],
    options
  );

  if (!posts) {
    throw new ApiError(500, "something went wrong when trying to find posts");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, posts, "Posts fetched successfully"));
});

const addLike = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  if (!isValidObjectId(postId)) {
    throw new ApiError(400, "Invalid post id");
  }

  const likedPost = await Posts.findById(postId);

  if (!likedPost) {
    throw new ApiError(400, "Post not found");
  }

  likedPost.likes.unshift(req.user?._id);

  await likedPost.save();

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "post liked successfully"));
});

const removeLike = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  if (!isValidObjectId(postId)) {
    throw new ApiError(400, "Invalid post id");
  }
  const likedPost = await Posts.findById(postId);

  const indexOfUser = likedPost.likes.indexOf(req.user?._id);
  likedPost.likes.splice(indexOfUser, 1);
  await likedPost.save();

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Like removed successfully"));
});

const getLikedUsers = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  if (!isValidObjectId(postId)) {
    throw new ApiError(400, "Invalid post id");
  }
  const likedPost = await Posts.findById(postId);
  if (!likedPost) {
    throw new ApiError(400, "Post not found");
  }

  const likedUsers = await Posts.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(postId),
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "likes",
        foreignField: "_id",
        as: "likes",
        pipeline: [
          {
            $project: {
              _id: 1,
              username: 1,
              "avatar.url": 1,
              follower: 1,
              following: 1,
            },
          },
        ],
      },
    },
    {
      $project: {
        _id: 1,
        likes: 1,
      },
    },
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, likedUsers, "Users fetched successfully"));
});

export {
  UploadPost,
  deletePost,
  editPost,
  getAllPost,
  getHomePosts,
  addLike,
  removeLike,
  getLikedUsers,
};
