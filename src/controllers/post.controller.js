import mongoose, { isValidObjectId, Types } from "mongoose";
import { postFolder } from "../constants.js";
import { Posts } from "../models/posts.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  deleteFromCloudinary,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";
import { Notification } from "../models/notification.model.js";
import { User } from "../models/user.model.js";

const UploadPost = asyncHandler(async (req, res) => {
  const { caption } = req.body;
  const postLocalPath = req?.file?.path;

  if (!postLocalPath) {
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "Please select a picture"));
  }

  const mentionedUsernames = caption
    ?.match(/@(\w+)/g)
    ?.map((match) => match.slice(1));

  const uploadedPost = await uploadOnCloudinary(postLocalPath, postFolder);

  if (!uploadedPost?.url) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, {}, "something went wrong while uploading post")
      );
  }

  const createdPost = await Posts.create({
    url: uploadedPost?.url,
    owner: req?.user?._id,
    caption: caption ? caption : "",
    publicId: uploadedPost?.public_id,
  });

  const post = await Posts.aggregate([
    {
      $match: {
        _id: new Types.ObjectId(createdPost._id),
      },
    },
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "postId",
        as: "comments",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $project: {
              _id: 1,
              username: 1,
              "avatar.url": 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "users",
        foreignField: "_id",
        localField: "likes",
        as: "likes",
        pipeline: [
          {
            $project: {
              _id: 1,
              follower: 1,
              username: 1,
              following: 1,
              "avatar.url": 1,
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
      $addFields: {
        totalComments: { $size: "$comments" },
      },
    },
    {
      $unset: "comments",
    },
  ]);

  if (!post) {
    throw new ApiError(401, "something went wrong while uploading post");
  }

  if (mentionedUsernames?.length > 0) {
    const mentionedUsers = await User.find({
      username: { $in: mentionedUsernames },
    });

    for (const mentionedUser of mentionedUsers) {
      const notification = await Notification.create({
        userId: mentionedUser?._id,
        type: "postMention",
        actionBy: req?.user?._id,
        post: createdPost?._id,
      });

      if (!notification) {
        throw new ApiError(500, "internal error");
      }
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, post[0], "post uploaded successfully"));
});

const deletePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  if (!postId) {
    throw new ApiError(400, "post is required");
  }

  await Notification.deleteMany({ post: postId });

  const post = await Posts.findById(postId);

  const deletedPost = await Posts.findByIdAndDelete({ _id: postId });
  if (!deletedPost) {
    throw new ApiError(400, "Something went wrong while deleting post");
  }

  if (post?.publicId) {
    await deleteFromCloudinary(post?.publicId, postFolder);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "post deleted successfully"));
});

const editPost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { caption } = req.body;

  const oldPost = await Posts.findById(postId);

  if (!oldPost) {
    throw new ApiError(404, "Post not found");
  }

  const oldCaption = oldPost.caption;

  const extractMentions = (caption) => {
    return caption?.match(/@(\w+)/g)?.map((match) => match.slice(1)) || [];
  };

  const oldMentions = extractMentions(oldCaption);
  const newMentions = extractMentions(caption);

  const newUniqueMentions = newMentions.filter(
    (mention) => !oldMentions.includes(mention)
  );

  const removedMentions = oldMentions.filter(
    (mention) => !newMentions.includes(mention)
  );

  const updatedPost = await Posts.findByIdAndUpdate(
    postId,
    { caption, edit: true },
    { new: true }
  );

  if (!updatedPost) {
    throw new ApiError(404, "Post not found");
  }

  if (newUniqueMentions.length > 0) {
    const mentionedUsers = await User.find({
      username: { $in: newUniqueMentions },
    });

    for (const mentionedUser of mentionedUsers) {
      const notification = await Notification.create({
        userId: mentionedUser?._id,
        type: "postMention",
        actionBy: req?.user?._id,
        post: postId,
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
        type: "postMention",
        actionBy: req?.user?._id,
        post: postId,
      });

      if (!result) {
        throw new ApiError(500, "Internal error");
      }
    }
  }

  res
    .status(200)
    .json(new ApiResponse(200, updatedPost, "Post updated successfully"));
});

const getAllPost = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const perPage = 12;

  const skip = (page - 1) * perPage;

  const totalPosts = await Posts.countDocuments();
  const totalPages = Math.ceil(totalPosts / perPage);

  const posts = await Posts.aggregate([
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "postId",
        as: "comments",
      },
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $skip: skip,
    },
    {
      $limit: perPage,
    },
  ]);

  if (!posts) {
    throw new ApiError(500, "something went wrong when trying to find posts");
  }
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        posts,
        totalPosts,
        totalPages,
        currentPage: page,
        postsFetched: posts?.length,
      },
      "Posts fetched successfully"
    )
  );
});

const getHomePosts = asyncHandler(async (req, res) => {
  const currentUser = req.user;
  const followingUsers = currentUser.following;
  const page = parseInt(req.query.page) || 1;
  const perPage = 5;

  const skip = (page - 1) * perPage;

  const totalPosts = await Posts.countDocuments({
    $or: [{ owner: { $in: followingUsers } }, { owner: currentUser._id }],
  });
  const totalPages = Math.ceil(totalPosts / perPage);

  const posts = await Posts.aggregate([
    {
      $match: {
        $or: [{ owner: { $in: followingUsers } }, { owner: currentUser._id }],
      },
    },
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "postId",
        as: "comments",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $project: {
              _id: 1,
              username: 1,
              "avatar.url": 1,
              createdAt: 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "users",
        foreignField: "_id",
        localField: "likes",
        as: "likes",
        pipeline: [
          {
            $project: {
              _id: 1,
              follower: 1,
              username: 1,
              following: 1,
              "avatar.url": 1,
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
      $addFields: {
        totalComments: { $size: "$comments" },
      },
    },
    {
      $unset: "comments",
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $skip: skip,
    },
    {
      $limit: perPage,
    },
  ]);

  if (!posts) {
    throw new ApiError(500, "Failed to fetch posts");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        posts,
        totalPosts,
        totalPages,
        currentPage: page,
        postsFetched: posts?.length,
      },
      "Posts fetched successfully"
    )
  );
});

const addLike = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  if (!isValidObjectId(postId)) {
    throw new ApiError(400, "Invalid post id");
  }
  const userId = req.user._id;

  const likedPost = await Posts.findByIdAndUpdate(
    postId,
    { $addToSet: { likes: userId } },
    { new: true }
  );

  if (!likedPost) {
    throw new ApiError(400, "Post not found");
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $addToSet: { likedPosts: postId } },
    { new: true }
  );

  if (!updatedUser) {
    throw new ApiError(500, "Failed to update user's liked posts");
  }

  const likes = await Posts.aggregate([
    { $match: { _id: new Types.ObjectId(postId) } },
    {
      $lookup: {
        from: "users",
        foreignField: "_id",
        localField: "likes",
        as: "likes",
        pipeline: [
          {
            $project: {
              _id: 1,
              follower: 1,
              username: 1,
              following: 1,
              "avatar.url": 1,
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

  if (!likedPost?.owner.equals(req.user._id)) {
    const notification = await Notification.create({
      userId: likedPost?.owner,
      type: "like",
      actionBy: req?.user?._id,
      post: postId,
    });

    if (!notification) {
      throw new ApiError(500, "internal error");
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, likes[0].likes, "post liked successfully"));
});

const removeLike = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  if (!isValidObjectId(postId)) {
    throw new ApiError(400, "Invalid post id");
  }
  const userId = req.user._id;

  const likedPost = await Posts.findByIdAndUpdate(
    postId,
    { $pull: { likes: userId } },
    { new: true }
  );

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $pull: { likedPosts: postId } },
    { new: true }
  );

  if (!updatedUser) {
    throw new ApiError(500, "Failed to update user's liked posts");
  }

  if (!likedPost) {
    throw new ApiError(400, "Post not found");
  }

  const likes = await Posts.aggregate([
    { $match: { _id: new Types.ObjectId(postId) } },
    {
      $lookup: {
        from: "users",
        foreignField: "_id",
        localField: "likes",
        as: "likes",
        pipeline: [
          {
            $project: {
              _id: 1,
              follower: 1,
              username: 1,
              following: 1,
              "avatar.url": 1,
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

  await Notification.findOneAndDelete({
    userId: likedPost?.owner,
    type: "like",
    actionBy: req?.user?._id,
    post: postId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, likes[0].likes, "Like removed successfully"));
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
        likes: 1,
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(200, likedUsers[0].likes, "Users fetched successfully")
    );
});

const getPostById = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  if (!isValidObjectId(postId)) {
    throw new ApiError(400, "Invalid post id");
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
    {
      $lookup: {
        from: "users",
        foreignField: "_id",
        localField: "likes",
        as: "likes",
        pipeline: [
          {
            $project: {
              _id: 1,
              follower: 1,
              username: 1,
              following: 1,
              "avatar.url": 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $project: {
              _id: 1,
              avatar: 1,
              username: 1,
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
  ]);

  if (!post) {
    throw new ApiError(400, "Post not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, post[0], "post found successfully"));
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
  getPostById,
};
