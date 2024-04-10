import { isValidObjectId } from "mongoose";
import { Comment } from "../models/comment.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getPostComments = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  if (!isValidObjectId(postId)) {
    throw new ApiError(400, "Invalid post id");
  }
  const comments = await Comment.find({ postId }).populate(
    "user",
    "username avatar.url _id"
  );

  if (!comments) {
    throw new ApiError(400, "No comments found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, comments, "comments fetched successfully"));
});

const addComment = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { text } = req.body;

  if (!isValidObjectId(postId)) {
    throw new ApiError(400, "Invalid post id");
  }

  if (!text) {
    throw new ApiError(400, "Comment missing");
  }
  const comment = await Comment.create({
    postId,
    user: req?.user?._id,
    text,
  });

  if (!comment) {
    throw new ApiError(400, "Something went wrong while creating comment");
  }
  return res
    .status(201)
    .json(new ApiResponse(201, {}, "Comment created successfully"));
});

const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid post id");
  }

  const deletedComment = await Comment.findByIdAndDelete(commentId);

  if (!deletedComment) {
    throw new ApiError(500, "Something went wrong while deleting comment");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Comment deleted successfully"));
});

export { getPostComments, addComment, deleteComment };
