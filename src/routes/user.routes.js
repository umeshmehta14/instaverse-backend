import { Router } from "express";
import {
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
} from "../controllers/user.controller.js";
import { verifyJwt } from "../middlewares/auth.middleware.js";

const userRouter = new Router();

userRouter.route("/sign-up").post(registerUser);
userRouter.route("/log-in").post(loginUser);
userRouter.route("/logout").get(verifyJwt, logoutUser);
userRouter.route("/refresh-token").post(refreshAccessToken);

export default userRouter;
