import { Router } from "express";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import {
  deleteNotification,
  getUserNotification,
  markReadNotifications,
} from "../controllers/notification.controller.js";

const notificationRouter = new Router();

notificationRouter.route("/").get(verifyJwt, getUserNotification);
notificationRouter.route("/read").get(verifyJwt, markReadNotifications);
notificationRouter
  .route("/:notificationId")
  .delete(verifyJwt, deleteNotification);

export default notificationRouter;
