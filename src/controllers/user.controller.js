import { isValidObjectId } from "mongoose";
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

const addBookmark = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  if (!postId || !isValidObjectId(postId)) {
    throw new ApiError(404, "Invalid post id");
  }

  const userId = req?.user?._id;
  const user = await User.findOne({ _id: userId });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.bookmarks.push(postId);
  await user.save();
  await User.populate(user, { path: "bookmarks", select: "_id url" });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { bookmarks: user.bookmarks },
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
  const user = await User.findOne({ _id: userId });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.bookmarks = user?.bookmarks?.filter(
    (bookmark) => bookmark?.toString() !== postId
  );

  await user.save();
  await User.populate(user, { path: "bookmarks", select: "_id url" });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { bookmarks: user.bookmarks },
        "Bookmark removed successfully"
      )
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  editUserProfile,
  addBookmark,
  removeBookmark,
};
