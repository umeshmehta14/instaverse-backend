import mongoose, { isValidObjectId } from "mongoose";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import crypto from "crypto";
import bcrypt from "bcrypt";

import { profileFolder } from "../constants.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  deleteFromCloudinary,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";
import { isValidEmail } from "../utils/isValidEmail.js";
import { Notification } from "../models/notification.model.js";

const options = {
  httpOnly: true,
  secure: true,
};

const otpStore = {};

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = await user.getAccessToken();
    const refreshToken = await user.getRefreshToken();

    user.refreshToken = refreshToken;
    user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "something went wrong while generating access token and refresh token"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { fullName, username, password, email } = req.body;

  const user = await User.create({
    fullName,
    username,
    email,
    password,
  });

  if (!user) {
    return res
      .status(400)
      .json(
        new ApiError(500, {}, "something went wrong while creating a new user")
      );
  }

  const { refreshToken, accessToken } = await generateAccessAndRefreshToken(
    user?._id
  );

  const createdUser = await User.findById(user?._id).select(
    "-password -refreshToken"
  );

  return res
    .status(201)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        201,
        { createdUser, accessToken, refreshToken },
        "user created successfully"
      )
    );
});

const validateUserDetails = asyncHandler(async (req, res) => {
  const { username, password, email } = req.body;

  const validationResults = {
    username: false,
    password: false,
    email: false,
    text: "",
  };

  if (isValidEmail(email)) {
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      validationResults.text = "Email address already exists";
    } else {
      validationResults.email = true;
    }
  } else {
    validationResults.text = "Enter a valid email address.";
  }

  if (password?.length >= 8) {
    validationResults.password = true;
  }

  if (username) {
    if (/\s/.test(username)) {
      validationResults.text =
        "Usernames can only use letters, numbers, underscores and periods.";
    } else {
      const existingUsername = await User.findOne({ username });
      if (existingUsername) {
        validationResults.text =
          "This username isn't available. Please try another.";
      } else {
        validationResults.username = true;
      }
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, validationResults, "Validated successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier) {
    return res
      .status(400)
      .json(new ApiError(400, {}, "Email or username is required"));
  }

  let user;

  if (isValidEmail(identifier)) {
    user = await User.findOne({ email: identifier });
  } else {
    user = await User.findOne({ username: identifier });
  }

  if (!user) {
    return res.status(400).json(new ApiError(400, {}, "User not found"));
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    return res.status(401).json(new ApiError(401, {}, "Wrong Password"));
  }

  const { refreshToken, accessToken } = await generateAccessAndRefreshToken(
    user._id
  );

  const loggedInUser = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(user._id),
      },
    },
    {
      $lookup: {
        from: "posts",
        localField: "_id",
        foreignField: "owner",
        as: "posts",
        pipeline: [
          {
            $lookup: {
              from: "comments",
              localField: "_id",
              foreignField: "postId",
              as: "comments",
            },
          },
          {
            $sort: {
              createdAt: -1,
            },
          },
          {
            $project: {
              _id: 1,
              likes: 1,
              url: 1,
              comments: 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "follower",
        foreignField: "_id",
        as: "follower",
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
        localField: "following",
        foreignField: "_id",
        as: "following",
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
      $project: {
        _id: 1,
        username: 1,
        fullName: 1,
        email: 1,
        avatar: 1,
        bio: 1,
        portfolio: 1,
        follower: 1,
        following: 1,
        posts: 1,
        createdAt: 1,
      },
    },
  ]);

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser[0], refreshToken, accessToken },
        "User logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user?._id,
    {
      $unset: { refreshToken: 1 },
    },
    { new: true }
  );

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logout seccessfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized access");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
      user?._id
    );

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken, user },
          "Access Token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const sendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const otp = crypto.randomInt(1000, 9999).toString();
  const otpExpirationTime = Date.now() + 5 * 60 * 1000;

  otpStore[email] = { otp, expiresAt: otpExpirationTime };

  var transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL,
      pass: process.env.EMAIL_PASS,
    },
    tls: { rejectUnauthorized: false },
  });

  var mailOptions = {
    from: process.env.EMAIL,
    to: email,
    subject: "OTP from instaverse",
    html: `<p>Your OTP is <strong style="font-size: 1.2em; color: #007bff;">${otp}</strong>. It is valid for 5 minutes. Please do not share this OTP with anyone for security reasons.</p>`,
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      res.status(500).json(new ApiResponse(500, {}, "Failed to send email"));
    } else {
      return res
        .status(200)
        .json(new ApiResponse(200, {}, "otp sent successfully"));
    }
  });
});

const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new ApiError(400, "Email and OTP are required");
  }

  const storedOtpData = otpStore[email];

  if (!storedOtpData) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, {}, "OTP not found. Please request a new OTP.")
      );
  }

  const { otp: storedOtp, expiresAt } = storedOtpData;

  if (Date.now() > expiresAt) {
    delete otpStore[email];
    return res
      .status(400)
      .json(
        new ApiResponse(400, {}, "OTP has expired. Please request a new OTP.")
      );
  }

  if (otp !== storedOtp) {
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "Invalid OTP. Please try again."));
  }

  delete otpStore[email];

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "OTP verified successfully"));
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.status(400).json(new ApiError(400, {}, "Email is required"));
  }

  if (!password) {
    return res.status(400).json(new ApiError(400, {}, "Password is required"));
  }

  if (password?.length < 8) {
    return res
      .status(400)
      .json(
        new ApiError(400, {}, "Password must contain atleast 8 characters")
      );
  }

  const user = await User.findOne({ email });

  if (!user) {
    return res.status(400).json(new ApiError(400, {}, "Invalid Email"));
  }

  const isSamePassword = await bcrypt.compare(password, user.password);

  if (isSamePassword) {
    return res
      .status(400)
      .json(
        new ApiError(
          400,
          {},
          "New password must be different from the old password"
        )
      );
  }

  user.password = password;

  await user.save();

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const editUserProfile = asyncHandler(async (req, res) => {
  const { bio, avatar, fullName, portfolio, username } = req.body;
  const avatarLocalPath = req?.file?.path;

  if (username !== req.user?.username) {
    const existingUsername = await User.findOne({ username });

    if (existingUsername) {
      return res
        .status(400)
        .json(new ApiError(400, {}, "Username already exists"));
    }

    if (/\s/.test(username)) {
      return res
        .status(400)
        .json(new ApiError(400, {}, "Username cannot contain spaces"));
    }
  }

  let user;

  // if user choose a avatar
  if (avatar) {
    user = await User.findByIdAndUpdate(
      req.user?._id,
      {
        $set: {
          avatar: { url: avatar, publicId: "" },
          bio,
          fullName,
          portfolio,
          username,
        },
      },
      {
        new: true,
      }
    ).select("-password -refreshToken");
  }

  const publicId = req.user?.avatar?.publicId;

  if (!avatarLocalPath && !avatar) {
    // if user doesnt wants to upload/update profile picture then upload remaining data
    user = await User.findByIdAndUpdate(
      req.user?._id,
      {
        $set: {
          bio,
          fullName,
          portfolio,
          username,
        },
      },
      {
        new: true,
      }
    ).select("-password -refreshToken");
  } else {
    if (publicId) {
      // if user uploaded avatar then delete the old picture
      if (avatar) {
        await deleteFromCloudinary(publicId, profileFolder);
      }
      // if user wants to update there picture
      else {
        const uploadedAvatar = await uploadOnCloudinary(
          avatarLocalPath,
          profileFolder
        );

        if (!uploadedAvatar?.url) {
          throw new ApiError(
            400,
            "something went wrong while uploading avatar"
          );
        }
        user = await User.findByIdAndUpdate(
          req.user?._id,
          {
            $set: {
              avatar: {
                url: uploadedAvatar.url,
                publicId: uploadedAvatar.public_id,
              },
              bio,
              fullName,
              portfolio,
              username,
            },
          },
          {
            new: true,
          }
        ).select("-password -refreshToken");
        await deleteFromCloudinary(publicId, profileFolder);
      }
    } else {
      // when the user uploaded its first picture
      if (!avatar) {
        const uploadedAvatar = await uploadOnCloudinary(
          avatarLocalPath,
          profileFolder
        );

        if (!uploadedAvatar.url) {
          throw new ApiError(
            400,
            "something went wrong while uploading avatar"
          );
        }
        user = await User.findByIdAndUpdate(
          req.user?._id,
          {
            $set: {
              avatar: {
                url: uploadedAvatar.url,
                publicId: uploadedAvatar.public_id,
              },
              bio,
              fullName,
              portfolio,
              username,
            },
          },
          {
            new: true,
          }
        ).select("-password -refreshToken");
      }
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user, "profile updated successfully"));
});

const getBookmark = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req?.user?._id),
      },
    },
    {
      $lookup: {
        from: "posts",
        localField: "bookmarks",
        foreignField: "_id",
        as: "bookmarks",
        pipeline: [
          {
            $lookup: {
              from: "comments",
              localField: "_id",
              foreignField: "postId",
              as: "comments",
            },
          },
          {
            $project: {
              _id: 1,
              likes: 1,
              url: 1,
              comments: 1,
            },
          },
        ],
      },
    },
  ]);

  if (!user) {
    throw new ApiError(404, "something went wrong ");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0].bookmarks || [],
        "Bookmark fetched successfully"
      )
    );
});

const addBookmark = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  if (!postId || !isValidObjectId(postId)) {
    throw new ApiError(404, "Invalid post id");
  }

  const userId = req?.user?._id;
  const updatedUser = await User.findOneAndUpdate(
    { _id: userId },
    { $push: { bookmarks: { $each: [postId], $position: 0 } } },
    { new: true }
  );

  if (!updatedUser) {
    throw new ApiError(404, "User not found");
  }

  const userBookmark = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req?.user?._id),
      },
    },
    {
      $lookup: {
        from: "posts",
        localField: "bookmarks",
        foreignField: "_id",
        as: "bookmarks",
        pipeline: [
          {
            $lookup: {
              from: "comments",
              localField: "_id",
              foreignField: "postId",
              as: "comments",
            },
          },
          {
            $project: {
              _id: 1,
              likes: 1,
              url: 1,
              comments: 1,
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        userBookmark[0].bookmarks,
        "Bookmark added successfully"
      )
    );
});

const removeBookmark = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  if (!postId || !isValidObjectId(postId)) {
    throw new ApiError(404, "Invalid post id");
  }

  const userId = req.user?._id;

  const updatedUser = await User.findOneAndUpdate(
    { _id: userId },
    { $pull: { bookmarks: postId } },
    { new: true }
  );

  if (!updatedUser) {
    throw new ApiError(404, "User not found");
  }
  const userBookmark = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req?.user?._id),
      },
    },
    {
      $lookup: {
        from: "posts",
        localField: "bookmarks",
        foreignField: "_id",
        as: "bookmarks",
        pipeline: [
          {
            $lookup: {
              from: "comments",
              localField: "_id",
              foreignField: "postId",
              as: "comments",
            },
          },
          {
            $project: {
              _id: 1,
              likes: 1,
              url: 1,
              comments: 1,
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        userBookmark[0].bookmarks || [],
        "Bookmark removed successfully"
      )
    );
});

const getFollower = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId || !isValidObjectId(userId)) {
    throw new ApiError(404, "Invalid user id");
  }

  const followers = await User.aggregate([
    {
      $match: { _id: new mongoose.Types.ObjectId(userId) },
    },
    {
      $lookup: {
        from: "users",
        localField: "follower",
        foreignField: "_id",
        as: "follower",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "follower",
              foreignField: "_id",
              as: "follower",
              pipeline: [
                {
                  $project: {
                    username: 1,
                    _id: 1,
                    follower: 1,
                    following: 1,
                  },
                },
              ],
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "following",
              foreignField: "_id",
              as: "following",
              pipeline: [
                {
                  $project: {
                    username: 1,
                    _id: 1,
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
              "avatar.url": 1,
              follower: 1,
              following: 1,
              username: 1,
              fullName: 1,
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        followers[0].follower || [],
        "followers fetched successfully"
      )
    );
});

const getFollowing = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId || !isValidObjectId(userId)) {
    throw new ApiError(404, "Invalid user id");
  }

  const followings = await User.aggregate([
    {
      $match: { _id: new mongoose.Types.ObjectId(userId) },
    },
    {
      $lookup: {
        from: "users",
        localField: "following",
        foreignField: "_id",
        as: "following",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "follower",
              foreignField: "_id",
              as: "follower",
              pipeline: [
                {
                  $project: {
                    username: 1,
                    _id: 1,
                    follower: 1,
                    following: 1,
                  },
                },
              ],
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "following",
              foreignField: "_id",
              as: "following",
              pipeline: [
                {
                  $project: {
                    username: 1,
                    _id: 1,
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
              "avatar.url": 1,
              follower: 1,
              following: 1,
              username: 1,
              fullName: 1,
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        followings[0].following || [],
        "followers fetched successfully"
      )
    );
});

const followUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId || !isValidObjectId(userId)) {
    throw new ApiError(404, "Invalid user id");
  }

  const followerId = req?.user?._id;

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.follower.push(followerId);
  await user.save();

  const followingUser = await User.findById(followerId);
  if (!followingUser) {
    throw new ApiError(404, "User not found");
  }

  followingUser.following.push(userId);
  await followingUser.save();

  const populatedFollowingUser = await User.findById(followerId).populate({
    path: "following",
    select: "_id username avatar.url following follower",
  });

  const notification = await Notification.create({
    userId: userId,
    type: "follow",
    actionBy: followerId,
  });

  if (!notification) {
    throw new ApiError(500, "internal error");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { following: populatedFollowingUser.following },
        "following updated successfully"
      )
    );
});

const unfollowUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId || !isValidObjectId(userId)) {
    throw new ApiError(404, "Invalid user id");
  }
  const followerId = req?.user?._id;

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.follower = user?.follower?.filter(
    (follow) => follow?.toString() !== followerId.toString()
  );

  await user.save();

  const followingUser = await User.findById(followerId);
  if (!followingUser) {
    throw new ApiError(404, "User not found");
  }

  followingUser.following = followingUser?.following?.filter(
    (follow) => follow?.toString() !== userId
  );
  await followingUser.save();
  const populatedFollowingUser = await User.findById(followerId).populate({
    path: "following",
    select: "_id username avatar.url following follower",
  });

  const notificationsToDelete = await Notification.findOneAndDelete({
    userId: userId,
    type: "follow",
    actionBy: followerId,
  });

  if (!notificationsToDelete) {
    throw new ApiError(500, "internal error");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { following: populatedFollowingUser.following },
        "following updated successfully"
      )
    );
});

const removeFollower = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId || !isValidObjectId(userId)) {
    throw new ApiError(404, "Invalid user id");
  }
  const followerId = req?.user?._id;

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.following = user?.following?.filter(
    (follow) => follow?.toString() !== followerId.toString()
  );

  await user.save();

  const followingUser = await User.findById(followerId);
  if (!followingUser) {
    throw new ApiError(404, "User not found");
  }

  followingUser.follower = followingUser?.follower?.filter(
    (follow) => follow?.toString() !== userId
  );
  await followingUser.save();
  const populatedFollowingUser = await User.findById(followerId).populate({
    path: "follower",
    select: "_id username avatar.url following follower",
    populate: {
      path: "following",
      select: "_id username avatar.url following follower",
    },
    populate: {
      path: "follower",
      select: "_id username avatar.url following follower",
    },
  });

  const notificationsToDelete = await Notification.findOneAndDelete({
    userId: followerId,
    type: "follow",
    actionBy: userId,
  });

  if (!notificationsToDelete) {
    throw new ApiError(500, "internal error");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { follower: populatedFollowingUser.follower },
        "following updated successfully"
      )
    );
});

const getGuestUsers = asyncHandler(async (_, res) => {
  const guestUsers = await User.find({ guest: true });
  if (!guestUsers) {
    throw new ApiError(
      500,
      "Something went wrong when trying to get guest users"
    );
  }

  return res
    .status(200)
    .json(new ApiResponse(200, guestUsers, "guest users fetched successfully"));
});

const getSearchedUsers = asyncHandler(async (req, res) => {
  const { query } = req.query;

  if (!query) {
    throw new ApiError(400, "Search query is required");
  }

  const users = await User.find({
    $and: [
      {
        _id: { $ne: req?.user?._id },
      },
      {
        $or: [
          { username: { $regex: query, $options: "i" } },
          { fullName: { $regex: query, $options: "i" } },
        ],
      },
    ],
  })
    .select("username fullName avatar.url _id follower following")
    .populate("follower", "username fullName  _id")
    .populate("following", "username fullName  _id");

  return res
    .status(200)
    .json(new ApiResponse(200, { users }, "User found successfully"));
});

const getUserById = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId && !isValidObjectId(userId)) {
    throw new ApiError(400, "Invalid UserId provided");
  }

  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(userId),
      },
    },
    {
      $lookup: {
        from: "posts",
        localField: "_id",
        foreignField: "owner",
        as: "posts",
        pipeline: [
          {
            $lookup: {
              from: "comments",
              localField: "_id",
              foreignField: "postId",
              as: "comments",
            },
          },
          {
            $sort: {
              createdAt: 1,
            },
          },
          {
            $project: {
              _id: 1,
              likes: 1,
              url: 1,
              comments: 1,
            },
          },
        ],
      },
    },
    {
      $project: {
        _id: 1,
        username: 1,
        fullName: 1,
        email: 1,
        avatar: 1,
        bio: 1,
        portfolio: 1,
        followers: 1,
        following: 1,
        posts: 1,
        createdAt: 1,
      },
    },
  ]);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user[0], "User found successfully"));
});

const getUserByUsername = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username) {
    throw new ApiError(400, "username required");
  }

  const user = await User.aggregate([
    {
      $match: {
        username,
      },
    },
    {
      $lookup: {
        from: "posts",
        localField: "_id",
        foreignField: "owner",
        as: "posts",
        pipeline: [
          {
            $lookup: {
              from: "comments",
              localField: "_id",
              foreignField: "postId",
              as: "comments",
            },
          },
          {
            $sort: {
              createdAt: -1,
            },
          },
          {
            $project: {
              _id: 1,
              likes: 1,
              url: 1,
              comments: 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "follower",
        foreignField: "_id",
        as: "follower",
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
        localField: "following",
        foreignField: "_id",
        as: "following",
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
      $project: {
        _id: 1,
        username: 1,
        fullName: 1,
        email: 1,
        avatar: 1,
        bio: 1,
        portfolio: 1,
        follower: 1,
        following: 1,
        posts: 1,
        createdAt: 1,
      },
    },
  ]);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user[0], "User found successfully"));
});

const getLikedPost = asyncHandler(async (req, res) => {
  const likedPost = await User.aggregate([
    {
      $match: { _id: new mongoose.Types.ObjectId(req?.user?._id) },
    },
    {
      $lookup: {
        from: "posts",
        localField: "likedPosts",
        foreignField: "_id",
        as: "likedPosts",
        pipeline: [
          {
            $lookup: {
              from: "comments",
              localField: "_id",
              foreignField: "postId",
              as: "comments",
            },
          },
          {
            $sort: {
              createdAt: 1,
            },
          },
          {
            $project: {
              _id: 1,
              likes: 1,
              url: 1,
              comments: 1,
            },
          },
        ],
      },
    },
  ]);

  if (!likedPost) {
    throw new ApiError(400, "something went wrong");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        likedPost[0].likedPosts || [],
        "Liked posts fetched successfully"
      )
    );
});

const getSuggestedUser = asyncHandler(async (req, res) => {
  const currentUser = req.user;

  const suggestedUsers = await User.find({
    _id: { $nin: [...currentUser.following, currentUser._id] },
  })
    .limit(5)
    .populate({
      path: "follower",
      select: "_id username avatar.url following follower",
      populate: {
        path: "following",
        select: "_id username avatar.url following follower",
      },
      populate: {
        path: "follower",
        select: "_id username avatar.url following follower",
      },
    })
    .populate({
      path: "following",
      select: "_id username avatar.url following follower",
      populate: {
        path: "following",
        select: "_id username avatar.url following follower",
      },
      populate: {
        path: "follower",
        select: "_id username avatar.url following follower",
      },
    })
    .select("_id username avatar.url following follower");

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        suggestedUsers || [],
        "Suggested users fetched successfully"
      )
    );
});

const getSearchList = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user?._id)
    .sort({ createdAt: -1 })
    .populate({
      path: "searchList",
      select: "_id username avatar.url fullName",
    });
  if (!user) {
    throw new ApiError(500, "Something went wrong");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user?.searchList || [],
        "Search list fetched successfully"
      )
    );
});

const addToSearchList = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId && !isValidObjectId(userId)) {
    throw new ApiError(400, "Invalid UserId provided");
  }

  const user = await User.findByIdAndUpdate(
    req?.user?._id,
    { $addToSet: { searchList: userId } },
    { new: true }
  )
    .sort({ createdAt: -1 })
    .populate({
      path: "searchList",
      select: "_id username avatar.url fullName",
    });

  if (!user) {
    throw new ApiError(500, "Something went wrong");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user?.searchList || [],
        "Search list updated successfully"
      )
    );
});

const removeFromSearchList = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId || !isValidObjectId(userId)) {
    throw new ApiError(400, "Invalid UserId provided");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $pull: { searchList: userId } },
    { new: true }
  )
    .sort({ createdAt: -1 })
    .populate({
      path: "searchList",
      select: "_id username avatar.url fullName",
    });

  if (!user) {
    throw new ApiError(500, "Something went wrong");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user?.searchList || [],
        "Search list updated successfully"
      )
    );
});

const clearSearchList = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req?.user?._id,
    { searchList: [] },
    { new: true }
  );

  if (!user) {
    throw new ApiError(500, "Something went wrong");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, user?.searchList, "Search list updated successfully")
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  validateUserDetails,
  refreshAccessToken,
  resetPassword,
  editUserProfile,
  getBookmark,
  addBookmark,
  removeBookmark,
  getFollower,
  getFollowing,
  followUser,
  unfollowUser,
  removeFollower,
  getGuestUsers,
  getSearchedUsers,
  getUserById,
  getLikedPost,
  getSuggestedUser,
  getUserByUsername,
  addToSearchList,
  removeFromSearchList,
  clearSearchList,
  getSearchList,
  sendOtp,
  verifyOtp,
};
