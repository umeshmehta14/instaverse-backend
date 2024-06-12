import { isValidObjectId, Types } from "mongoose";
import { Comment } from "../models/comment.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { Notification } from "../models/notification.model.js";
import { Posts } from "../models/posts.model.js";
import { User } from "../models/user.model.js";

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

  const mentionedUsernames = text
    .match(/@(\w+)/g)
    .map((match) => match.slice(1));

  console.log({ mentionedUsernames });

  const comment = await Comment.create({
    postId,
    user: req?.user?._id,
    text,
  });

  if (!comment) {
    throw new ApiError(400, "Something went wrong while creating comment");
  }

  const post = await Posts.aggregate([
    {
      $match: {
        _id: new Types.ObjectId(postId),
      },
    },
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "postId",
        as: "comments",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "user",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    username: 1,
                    _id: 1,
                    "avatar.url": 1,
                    createdAt: 1,
                  },
                },
              ],
            },
          },
          {
            $sort: { createdAt: -1 },
          },
          {
            $addFields: {
              owner: { $arrayElemAt: ["$owner", 0] },
            },
          },
        ],
      },
    },
  ]);

  if (!post) {
    throw new ApiError(400, "Post not found");
  }

  if (!post[0]?.owner.equals(req.user._id)) {
    const notification = await Notification.create({
      userId: post[0]?.owner,
      type: "comment",
      actionBy: req?.user?._id,
      post: postId,
      comment: comment?._id,
    });

    if (!notification) {
      throw new ApiError(500, "internal error");
    }
  }

  if (mentionedUsernames.length > 0) {
    const mentionedUsers = await User.find({
      username: { $in: mentionedUsernames },
    });

    for (const mentionedUser of mentionedUsers) {
      const notification = await Notification.create({
        userId: mentionedUser?._id,
        type: "mention",
        actionBy: req?.user?._id,
        post: postId,
        comment: comment?._id,
      });

      if (!notification) {
        throw new ApiError(500, "internal error");
      }
    }
  }

  return res
    .status(201)
    .json(
      new ApiResponse(201, post[0].comments, "Comment created successfully")
    );
});

const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid post id");
  }

  const comment = await Comment.findById(commentId);

  const deletedComment = await Comment.findByIdAndDelete(commentId);

  if (!deletedComment) {
    throw new ApiError(500, "Something went wrong while deleting comment");
  }

  const post = await Posts.aggregate([
    {
      $match: {
        _id: new Types.ObjectId(comment?.postId),
      },
    },
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "postId",
        as: "comments",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "user",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    username: 1,
                    _id: 1,
                    "avatar.url": 1,
                    createdAt: 1,
                  },
                },
              ],
            },
          },
          {
            $sort: { createdAt: -1 },
          },
          {
            $addFields: {
              owner: { $arrayElemAt: ["$owner", 0] },
            },
          },
        ],
      },
    },
  ]);

  if (!post) {
    throw new ApiError(400, "Post not found");
  }

  const mentionedUsernames = comment?.text
    ?.match(/@(\w+)/g)
    ?.map((match) => match.slice(1));

  for (const username of mentionedUsernames) {
    const mentionedUser = await User.findOne({ username });
    if (mentionedUser) {
      await Notification.findOneAndDelete({
        userId: mentionedUser._id,
        type: "mention",
        actionBy: comment.user,
        post: post[0]?._id,
        comment: commentId,
      });
    }
  }

  await Notification.findOneAndDelete({
    userId: post[0]?.owner,
    type: "comment",
    actionBy: comment?.user,
    post: post[0]?._id,
    comment: commentId,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, post[0].comments, "Comment deleted successfully")
    );
});

const editComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { text } = req.body;

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment id");
  }

  const updatedComment = await Comment.findByIdAndUpdate(
    commentId,
    { text, edit: true },
    { new: true }
  );

  if (!updatedComment) {
    throw new ApiError(400, "Something went wrong updating comment");
  }

  const post = await Posts.aggregate([
    {
      $match: {
        _id: new Types.ObjectId(updatedComment?.postId),
      },
    },
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "postId",
        as: "comments",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "user",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    username: 1,
                    _id: 1,
                    "avatar.url": 1,
                    createdAt: 1,
                  },
                },
              ],
            },
          },
          {
            $sort: { createdAt: -1 },
          },
          {
            $addFields: {
              owner: { $arrayElemAt: ["$owner", 0] },
            },
          },
        ],
      },
    },
  ]);

  if (!post) {
    throw new ApiError(400, "Post not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, post[0].comments, "comment updated successfully")
    );
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

  const post = await Posts.aggregate([
    {
      $match: {
        _id: new Types.ObjectId(updatedComment?.postId),
      },
    },
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "postId",
        as: "comments",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "user",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    username: 1,
                    _id: 1,
                    "avatar.url": 1,
                    createdAt: 1,
                  },
                },
              ],
            },
          },
          {
            $sort: { createdAt: -1 },
          },
          {
            $addFields: {
              owner: { $arrayElemAt: ["$owner", 0] },
            },
          },
        ],
      },
    },
  ]);

  if (!post) {
    throw new ApiError(400, "Post not found");
  }

  if (!updatedComment?.user.equals(req.user._id)) {
    const notification = await Notification.create({
      userId: updatedComment?.user,
      type: "commentLike",
      actionBy: req?.user?._id,
      post: updatedComment?.postId,
      comment: updatedComment?._id,
    });

    if (!notification) {
      throw new ApiError(500, "internal error");
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, post[0].comments, "comment liked successfully"));
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

  const post = await Posts.aggregate([
    {
      $match: {
        _id: new Types.ObjectId(updatedComment?.postId),
      },
    },
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "postId",
        as: "comments",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "user",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    username: 1,
                    _id: 1,
                    "avatar.url": 1,
                    createdAt: 1,
                  },
                },
              ],
            },
          },
          {
            $sort: { createdAt: -1 },
          },
          {
            $addFields: {
              owner: { $arrayElemAt: ["$owner", 0] },
            },
          },
        ],
      },
    },
  ]);

  if (!post) {
    throw new ApiError(400, "Post not found");
  }

  await Notification.findOneAndDelete({
    userId: updatedComment?.user,
    type: "commentLike",
    actionBy: req?.user?._id,
    post: updatedComment?.postId,
    comment: updatedComment?._id,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, post[0].comments, "like removed successfully"));
});

export {
  getPostComments,
  addComment,
  deleteComment,
  editComment,
  addLikeToComment,
  removeLikeFromComment,
};
