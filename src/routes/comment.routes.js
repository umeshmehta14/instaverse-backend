import { Router } from "express";
import {
  addComment,
  addLikeToComment,
  addReplyToComment,
  deleteComment,
  deleteReplyFromComment,
  editComment,
  getPostComments,
  removeLikeFromComment,
} from "../controllers/comment.controller.js";
import { verifyJwt } from "../middlewares/auth.middleware.js";

const commentRouter = new Router();

commentRouter
  .route("/:postId")
  .get(verifyJwt, getPostComments)
  .post(verifyJwt, addComment);
commentRouter
  .route("/:commentId")
  .delete(verifyJwt, deleteComment)
  .patch(verifyJwt, editComment);

commentRouter.route("/like/:commentId").patch(verifyJwt, addLikeToComment);
commentRouter
  .route("/unlike/:commentId")
  .patch(verifyJwt, removeLikeFromComment);
commentRouter.route("/:commentId/reply").patch(verifyJwt, addReplyToComment);
commentRouter
  .route("/:commentId/replies/:replyId")
  .delete(verifyJwt, deleteReplyFromComment);

export default commentRouter;
