import { Router } from "express";
import {
  addLike,
  deletePost,
  editPost,
  getAllPost,
  getHomePosts,
  getLikedUsers,
  getPostById,
  removeLike,
  UploadPost,
} from "../controllers/post.controller.js";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const postRouter = new Router();

postRouter.route("/").get(verifyJwt, getAllPost);
postRouter.route("/home").get(verifyJwt, getHomePosts);
postRouter.route("/:postId").get(verifyJwt, getPostById);

postRouter.route("/upload").post(verifyJwt, upload.single("post"), UploadPost);
postRouter.route("/delete/:postId").delete(verifyJwt, deletePost);
postRouter.route("/edit/:postId").patch(verifyJwt, editPost);

postRouter.route("/liked-user/:postId").get(verifyJwt, getLikedUsers);
postRouter.route("/like/:postId").patch(verifyJwt, addLike);
postRouter.route("/unlike/:postId").patch(verifyJwt, removeLike);

export default postRouter;
