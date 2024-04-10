import { Router } from "express";
import {
  deletePost,
  editPost,
  getAllPost,
  UploadPost,
} from "../controllers/post.controller.js";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const postRouter = new Router();

postRouter.route("/").get(verifyJwt, getAllPost);

postRouter.route("/upload").post(verifyJwt, upload.single("post"), UploadPost);
postRouter.route("/delete/:postId").delete(verifyJwt, deletePost);
postRouter.route("/edit/:postId").patch(verifyJwt, editPost);

export default postRouter;
