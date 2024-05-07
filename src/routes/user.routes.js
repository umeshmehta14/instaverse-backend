import { Router } from "express";
import {
  addBookmark,
  addToSearchList,
  clearSearchList,
  editUserProfile,
  followUser,
  getBookmark,
  getFollower,
  getFollowing,
  getGuestUsers,
  getLikedPost,
  getSearchedUsers,
  getSuggestedUser,
  getUserById,
  getUserByUsername,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
  removeBookmark,
  removeFollower,
  removeFromSearchList,
  unfollowUser,
} from "../controllers/user.controller.js";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const userRouter = new Router();

userRouter.route("/sign-up").post(registerUser);
userRouter.route("/log-in").post(loginUser);
userRouter.route("/logout").get(verifyJwt, logoutUser);
userRouter.route("/refresh-token").post(refreshAccessToken);

userRouter
  .route("/update-profile")
  .post(verifyJwt, upload.single("picture"), editUserProfile);

userRouter.route("/bookmark").get(verifyJwt, getBookmark);
userRouter.route("/bookmark/:postId").post(verifyJwt, addBookmark);
userRouter.route("/bookmark/:postId").delete(verifyJwt, removeBookmark);

userRouter.route("/follower/:userId").get(verifyJwt, getFollower);
userRouter.route("/following/:userId").get(verifyJwt, getFollowing);
userRouter.route("/follow/:userId").patch(verifyJwt, followUser);
userRouter.route("/unfollow/:userId").patch(verifyJwt, unfollowUser);
userRouter.route("/remove-follower/:userId").patch(verifyJwt, removeFollower);

userRouter.route("/guest").get(getGuestUsers);
userRouter.route("/suggested-user").get(verifyJwt, getSuggestedUser);
userRouter.route("/search").get(verifyJwt, getSearchedUsers);

userRouter.route("/searchList/add/:userId").patch(verifyJwt, addToSearchList);
userRouter
  .route("/searchList/remove/:userId")
  .patch(verifyJwt, removeFromSearchList);
userRouter.route("/searchList/clear").patch(verifyJwt, clearSearchList);

userRouter.route("/liked-posts").get(verifyJwt, getLikedPost);
userRouter.route("/:username").get(verifyJwt, getUserByUsername);
userRouter.route("/:userId").get(verifyJwt, getUserById);

export default userRouter;
