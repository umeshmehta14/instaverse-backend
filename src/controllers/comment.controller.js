import { isValidObjectId, Types } from "mongoose";
import { Comment } from "../models/comment.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { Notification } from "../models/notification.model.js";
import { Posts } from "../models/posts.model.js";
import { User } from "../models/user.model.js";

const getComments = async (_id) => {
  return await Posts.aggregate([
    {
      $match: {
        _id: new Types.ObjectId(_id),
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
            $addFields: {
              owner: { $arrayElemAt: ["$owner", 0] },
            },
          },
          {
            $lookup: {
              from: "users",
              let: { replyUsers: "$replies.owner" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $isArray: "$$replyUsers" },
                        { $in: ["$_id", "$$replyUsers"] },
                      ],
                    },
                  },
                },
                {
                  $project: {
                    username: 1,
                    _id: 1,
                    "avatar.url": 1,
                    createdAt: 1,
                  },
                },
              ],
              as: "replyOwners",
            },
          },
          {
            $addFields: {
              replies: {
                $map: {
                  input: {
                    $sortArray: {
                      input: "$replies",
                      sortBy: { createdAt: 1 },
                    },
                  },
                  as: "reply",
                  in: {
                    $mergeObjects: [
                      "$$reply",
                      {
                        owner: {
                          $arrayElemAt: [
                            {
                              $filter: {
                                input: "$replyOwners",
                                as: "replyOwner",
                                cond: {
                                  $eq: ["$$replyOwner._id", "$$reply.owner"],
                                },
                              },
                            },
                            0,
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
          {
            $sort: { createdAt: -1 },
          },
        ],
      },
    },
  ]);
};

const getPostComments = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  if (!isValidObjectId(postId)) {
    throw new ApiError(400, "Invalid post id");
  }

  const post = await getComments(postId);

  return res
    .status(200)
    .json(
      new ApiResponse(200, post[0].comments, "comments fetched successfully")
    );
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
    ?.match(/@(\w+)/g)
    ?.map((match) => match.slice(1));

  const comment = await Comment.create({
    postId,
    user: req?.user?._id,
    text,
  });

  if (!comment) {
    throw new ApiError(400, "Something went wrong while creating comment");
  }

  const post = await getComments(postId);

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

  if (mentionedUsernames?.length > 0) {
    const mentionedUsers = await User.find({
      username: { $in: mentionedUsernames },
    });

    for (const mentionedUser of mentionedUsers) {
      if (!mentionedUser?._id.equals(req.user._id)) {
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

  await Notification.deleteMany({ comment: commentId });
  const deletedComment = await Comment.findByIdAndDelete(commentId);

  if (!deletedComment) {
    throw new ApiError(500, "Something went wrong while deleting comment");
  }

  const post = await getComments(comment?.postId);

  if (!post) {
    throw new ApiError(400, "Post not found");
  }

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

  const oldComment = await Comment.findById(commentId);
  if (!oldComment) {
    throw new ApiError(404, "Comment not found");
  }

  const oldText = oldComment.text;

  const extractMentions = (text) => {
    return text?.match(/@(\w+)/g)?.map((match) => match.slice(1)) || [];
  };

  const oldMentions = extractMentions(oldText);
  const newMentions = extractMentions(text);

  const newUniqueMentions = newMentions.filter(
    (mention) => !oldMentions.includes(mention)
  );

  const removedMentions = oldMentions.filter(
    (mention) => !newMentions.includes(mention)
  );

  const updatedComment = await Comment.findByIdAndUpdate(
    commentId,
    { text, edit: true },
    { new: true }
  );

  if (!updatedComment) {
    throw new ApiError(400, "Something went wrong updating comment");
  }

  const post = await getComments(updatedComment?.postId);

  if (!post) {
    throw new ApiError(400, "Post not found");
  }

  if (newUniqueMentions.length > 0) {
    const mentionedUsers = await User.find({
      username: { $in: newUniqueMentions },
    });

    for (const mentionedUser of mentionedUsers) {
      const notification = await Notification.create({
        userId: mentionedUser?._id,
        type: "mention",
        actionBy: req?.user?._id,
        post: updatedComment?.postId,
        comment: updatedComment?._id,
      });

      if (!notification) {
        throw new ApiError(500, "Internal error");
      }
    }
  }

  if (removedMentions.length > 0) {
    const mentionedUsers = await User.find({
      username: { $in: removedMentions },
    });

    for (const mentionedUser of mentionedUsers) {
      const result = await Notification.deleteMany({
        userId: mentionedUser?._id,
        type: "mention",
        actionBy: req?.user?._id,
        post: updatedComment?.postId,
        comment: updatedComment?._id,
      });

      if (!result) {
        throw new ApiError(500, "Internal error");
      }
    }
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

  const post = await getComments(updatedComment?.postId);

  if (!post || post?.length === 0) {
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

  const post = await getComments(updatedComment?.postId);

  if (!post || post?.length === 0) {
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

const addReplyToComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { text } = req.body;

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment id");
  }

  if (!text) {
    throw new ApiError(400, "Reply text missing");
  }

  const comment = await Comment.findById(commentId);

  const mentionedUsernames = text
    ?.match(/@(\w+)/g)
    ?.map((match) => match.slice(1));

  const reply = {
    owner: req.user._id,
    text,
  };

  const updatedComment = await Comment.findByIdAndUpdate(
    commentId,
    { $push: { replies: reply } },
    { new: true }
  );

  if (!updatedComment) {
    throw new ApiError(400, "Something went wrong adding reply");
  }

  const post = await getComments(comment?.postId);

  if (!post || post?.length === 0) {
    throw new ApiError(400, "Post not found");
  }

  if (mentionedUsernames?.length > 0) {
    const mentionedUsers = await User.find({
      username: { $in: mentionedUsernames },
    });

    for (const mentionedUser of mentionedUsers) {
      if (!mentionedUser?.owner?.equals(req.user._id)) {
        const notification = await Notification.create({
          userId: mentionedUser?._id,
          type: "mention",
          actionBy: req?.user?._id,
          post: comment?.postId,
          comment: comment?._id,
        });

        if (!notification) {
          throw new ApiError(500, "internal error");
        }
      }
    }
  }

  return res
    .status(201)
    .json(new ApiResponse(201, post[0]?.comments, "Reply added successfully"));
});

const deleteReplyFromComment = asyncHandler(async (req, res) => {
  const { commentId, replyId } = req.params;

  if (!isValidObjectId(commentId) || !isValidObjectId(replyId)) {
    throw new ApiError(400, "Invalid comment or reply id");
  }

  const comment = await Comment.findOne({
    _id: commentId,
    "replies._id": replyId,
  });

  if (!comment) {
    throw new ApiError(404, "Comment or reply not found");
  }

  const reply = comment.replies.id(replyId);

  const mentionedUsernames = reply.text
    ?.match(/@(\w+)/g)
    ?.map((match) => match.slice(1));

  const replyIndex = comment.replies.findIndex((reply) =>
    reply._id.equals(replyId)
  );

  await Notification.deleteMany({
    userId: comment?.user,
    type: "commentLike",
    post: comment?.postId,
    comment: comment?._id,
    replyText: reply?.text,
  });

  if (replyIndex === -1) {
    throw new ApiError(404, "Reply not found");
  }

  comment.replies.splice(replyIndex, 1)[0];

  await comment.save();

  if (mentionedUsernames?.length > 0) {
    const mentionedUsers = await User.find({
      username: { $in: mentionedUsernames },
    });

    for (const mentionedUser of mentionedUsers) {
      await Notification.deleteMany({
        userId: mentionedUser._id,
        type: "mention",
        actionBy: req.user._id,
        post: comment.postId,
        comment: comment._id,
      });
    }
  }

  const post = await getComments(comment?.postId);

  if (!post || post?.length === 0) {
    throw new ApiError(400, "Post not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, post[0].comments, "Reply deleted successfully"));
});

const addLikeToReply = asyncHandler(async (req, res) => {
  const { commentId, replyId } = req.params;

  if (!isValidObjectId(commentId) || !isValidObjectId(replyId)) {
    throw new ApiError(400, "Invalid comment id or reply id");
  }

  const updatedComment = await Comment.findOneAndUpdate(
    { _id: commentId, "replies._id": replyId },
    { $addToSet: { "replies.$.likes": req.user._id } },
    { new: true }
  );

  if (!updatedComment) {
    throw new ApiError(400, "Something went wrong while liking the reply");
  }

  const post = await getComments(updatedComment?.postId);

  if (!post || post?.length === 0) {
    throw new ApiError(400, "Post not found");
  }

  const reply = updatedComment.replies.id(replyId);

  if (!reply?.owner?.equals(req.user._id)) {
    const notification = await Notification.create({
      userId: reply?.owner,
      type: "commentLike",
      actionBy: req?.user?._id,
      post: updatedComment?.postId,
      comment: updatedComment?._id,
      replyText: reply?.text,
    });

    if (!notification) {
      throw new ApiError(500, "internal error");
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, post[0].comments, "Reply liked successfully"));
});

const removeLikeFromReply = asyncHandler(async (req, res) => {
  const { commentId, replyId } = req.params;

  if (!isValidObjectId(commentId) || !isValidObjectId(replyId)) {
    throw new ApiError(400, "Invalid comment id or reply id");
  }

  const comment = await Comment.findOne({
    _id: commentId,
    "replies._id": replyId,
  });

  if (!comment) {
    throw new ApiError(404, "Comment or reply not found");
  }

  const updatedComment = await Comment.findOneAndUpdate(
    { _id: commentId, "replies._id": replyId },
    { $pull: { "replies.$.likes": req.user._id } },
    { new: true }
  );

  if (!updatedComment) {
    throw new ApiError(400, "Something went wrong while liking the reply");
  }

  const post = await getComments(updatedComment?.postId);

  if (!post || post?.length === 0) {
    throw new ApiError(400, "Post not found");
  }

  const reply = comment.replies.id(replyId);

  await Notification.findOneAndDelete({
    userId: updatedComment?.user,
    type: "commentLike",
    actionBy: req?.user?._id,
    post: updatedComment?.postId,
    comment: updatedComment?._id,
    replyText: reply?.text,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, post[0].comments, "Reply liked successfully"));
});

const getCommentLikeUsers = asyncHandler(async (req, res) => {
  const { commentId } = req.params;

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment id");
  }

  const likedUsers = await Comment.aggregate([
    {
      $match: {
        _id: new Types.ObjectId(commentId),
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
        likes: 1,
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(200, likedUsers[0].likes, "likes fetched successfully")
    );
});

const getReplyLikeUsers = asyncHandler(async (req, res) => {
  const { commentId, replyId } = req.params;

  if (!isValidObjectId(commentId) || !isValidObjectId(replyId)) {
    throw new ApiError(400, "Invalid comment or reply id");
  }
  const likedUsers = await Comment.aggregate([
    {
      $match: {
        _id: new Types.ObjectId(commentId),
      },
    },
    {
      $unwind: "$replies",
    },
    {
      $match: {
        "replies._id": new Types.ObjectId(replyId),
      },
    },
    {
      $project: {
        likes: "$replies.likes",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "likes",
        foreignField: "_id",
        as: "likedUsers",
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
        _id: 0,
        likedUsers: 1,
      },
    },
  ]);

  if (likedUsers.length === 0) {
    throw new ApiError(404, "Comment or reply not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        likedUsers[0].likedUsers,
        "Likes fetched successfully"
      )
    );
});

export {
  getPostComments,
  addComment,
  deleteComment,
  editComment,
  addLikeToComment,
  removeLikeFromComment,
  addReplyToComment,
  deleteReplyFromComment,
  addLikeToReply,
  removeLikeFromReply,
  getCommentLikeUsers,
  getReplyLikeUsers,
};
