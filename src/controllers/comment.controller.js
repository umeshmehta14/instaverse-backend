import { isValidObjectId } from "mongoose";
import { Comment } from "../models/comment.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { Notification } from "../models/notification.model.js";
import { Posts } from "../models/posts.model.js";

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

  const post = await Posts.findById(postId);

  const notification = await Notification.create({
    userId: post?.owner,
    type: "comment",
    actionBy: req?.user?._id,
    post: postId,
    comment: comment?._id,
  });

  if (!notification) {
    throw new ApiError(500, "internal error");
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

  const comment = await Comment.findById(commentId);
  const post = await Posts.findById(comment?.postId);

  const deletedComment = await Comment.findByIdAndDelete(commentId);

  if (!deletedComment) {
    throw new ApiError(500, "Something went wrong while deleting comment");
  }

  await Notification.findOneAndDelete({
    userId: post?.owner,
    type: "comment",
    actionBy: req?.user?._id,
    post: post?._id,
    comment: commentId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Comment deleted successfully"));
});

const editComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { text } = req.body;

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment id");
  }

  const updatedComment = await Comment.findByIdAndUpdate(
    commentId,
    { text },
    { new: true }
  );

  if (!updatedComment) {
    throw new ApiError(400, "Something went wrong updating comment");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "comment updated successfully"));
});

const addLikeToComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment id");
  }

  const updatedComment = await Comment.findByIdAndUpdate(
    commentId,
    { $push: { likes: req.user._id } },
    { new: true }
  );

  if (!updatedComment) {
    throw new ApiError(400, "Something went wrong while liking comment");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "comment liked successfully"));
});

const removeLikeFromComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment id");
  }

  const updatedComment = await Comment.findByIdAndUpdate(
    commentId,
    { $pull: { likes: req.user._id } },
    { new: true }
  );

  if (!updatedComment) {
    throw new ApiError(
      400,
      "Something went wrong while removing like from comment"
    );
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "like removed successfully"));
});

export {
  getPostComments,
  addComment,
  deleteComment,
  editComment,
  addLikeToComment,
  removeLikeFromComment,
};
