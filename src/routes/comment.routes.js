import { Router } from "express";
import { addComment } from "../controllers/comment.controller.js";

const commentRouter = new Router();

commentRouter.route("/").post(addComment);

export default commentRouter;
