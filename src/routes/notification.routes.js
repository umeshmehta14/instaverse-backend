import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import {
  getUserNotification,
  markReadNotifications,
} from "../controllers/notification.controller.js";

const notificationRouter = new Router();

notificationRouter.route("/").get(verifyJwt, getUserNotification);
notificationRouter.route("/read").get(verifyJwt, markReadNotifications);

export default notificationRouter;
