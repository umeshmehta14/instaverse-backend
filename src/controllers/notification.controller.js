import { Types } from "mongoose";
import { Notification } from "../models/notification.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

const getUserNotification = asyncHandler(async (req, res) => {
  const notifications = await Notification.aggregate([
    {
      $match: {
        userId: new Types.ObjectId(req.user?._id),
      },
    },
    {
      $sort: {
        createdAt: -1,
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "actionBy",
        foreignField: "_id",
        as: "actionBy",
        pipeline: [
          {
            $project: {
              _id: 1,
              "avatar.url": 1,
              username: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        actionBy: { $arrayElemAt: ["$actionBy", 0] },
      },
    },
    {
      $lookup: {
        from: "posts",
        localField: "post",
        foreignField: "_id",
        as: "post",
        pipeline: [
          {
            $project: {
              _id: 1,
              url: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        post: { $arrayElemAt: ["$post", 0] },
      },
    },
    {
      $lookup: {
        from: "comments",
        localField: "commentId",
        foreignField: "_id",
        as: "commentId",
        pipeline: [
          {
            $project: {
              _id: 1,
              url: 1,
            },
          },
        ],
      },
    },
  ]);

  if (!notifications) {
    throw new ApiError(500, "Notifications not available");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, notifications, "Notifications fetched successfully")
    );
});

const markReadNotifications = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { userId: req.user?._id, read: false },
    { $set: { read: true } }
  );

  if (!result) {
    throw new ApiError(404, "No unread notifications found to mark as read");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Notifications updated successfully"));
});

export { getUserNotification, markReadNotifications };
