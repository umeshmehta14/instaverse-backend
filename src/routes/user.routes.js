import { Router } from "express";
import {
  addBookmark,
  editUserProfile,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
  removeBookmark,
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
userRouter.route("/bookmark/:postId").post(verifyJwt, addBookmark);
userRouter.route("/bookmark/:postId").delete(verifyJwt, removeBookmark);

export default userRouter;
