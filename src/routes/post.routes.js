import { Router } from "express";
import { UploadPost } from "../controllers/post.controller.js";

const postRouter = new Router();

postRouter.route("/").post(UploadPost);

export default postRouter;
