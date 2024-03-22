import { Router } from "express";
import { seedPost, UploadPost } from "../controllers/post.controller.js";

const postRouter = new Router();

postRouter.route("/").post(UploadPost);
postRouter.route("/seed").get(seedPost);

export default postRouter;
