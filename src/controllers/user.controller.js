import mongoose, { isValidObjectId } from "mongoose";
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

const options = {
  httpOnly: true,
  secure: true,
};

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

  if (
    !(username?.trim() || fullName?.trim() || password?.trim() || email?.trim())
  ) {
    return res.status(400).json(new ApiError(400, {}, "Invalid credentials"));
  }

  if (!isValidEmail(email)) {
    return res.status(400).json(new ApiError(400, {}, "Invalid email address"));
  }

  if (password?.length < 8) {
    return res
      .status(400)
      .json(
        new ApiError(400, {}, "Password must contain atleast 8 characters")
      );
  }

  const existingUsername = await User.findOne({ username });
  if (existingUsername) {
    return res
      .status(400)
      .json(new ApiError(400, {}, "Username already exists"));
  }

  const existingEmail = await User.findOne({ email });
  if (existingEmail) {
    return res
      .status(400)
      .json(new ApiError(400, {}, "Email address already exists"));
  }

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

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, refreshToken, accessToken },
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

const editUserProfile = asyncHandler(async (req, res) => {
  const { bio, avatar, fullName, portfolio } = req.body;
  const avatarLocalPath = req?.file?.path;
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
      new ApiResponse(200, user[0].bookmarks || [], "User found successfully")
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
    { $addToSet: { bookmarks: postId } },
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
  });

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
  }).select("username fullName avatar.url _id follower");

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

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
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
};
