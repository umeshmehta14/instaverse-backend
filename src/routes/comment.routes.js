import { Router } from "express";
import {
  addComment,
  addLikeToComment,
  addLikeToReply,
  addReplyToComment,
  deleteComment,
  deleteReplyFromComment,
  editComment,
  getPostComments,
  removeLikeFromComment,
  removeLikeFromReply,
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

commentRouter
  .route("/:commentId/replies/:replyId/like")
  .patch(verifyJwt, addLikeToReply);
commentRouter
  .route("/:commentId/replies/:replyId/unlike")
  .patch(verifyJwt, removeLikeFromReply);

export default commentRouter;
