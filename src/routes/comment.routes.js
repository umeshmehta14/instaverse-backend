import { Router } from "express";
import {
  addComment,
  addLikeToComment,
  deleteComment,
  editComment,
  getPostComments,
  removeLikeFromComment,
} from "../controllers/comment.controller.js";
import { verifyJwt } from "../middlewares/auth.middleware.js";

const commentRouter = new Router();

commentRouter.route("/:postId").get(verifyJwt, getPostComments);
commentRouter.route("/:postId").post(verifyJwt, addComment);
commentRouter.route("/:commentId").delete(verifyJwt, deleteComment);
commentRouter.route("/:commentId").patch(verifyJwt, editComment);
commentRouter.route("/like/:commentId").patch(verifyJwt, addLikeToComment);
commentRouter
  .route("/unlike/:commentId")
  .patch(verifyJwt, removeLikeFromComment);

export default commentRouter;
