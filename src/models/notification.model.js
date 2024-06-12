import { model, Schema } from "mongoose";

const notificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["like", "comment", "follow", "commentLike", "mention"],
      required: true,
    },
    actionBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    post: { type: Schema.Types.ObjectId, ref: "Post" },
    comment: { type: Schema.Types.ObjectId, ref: "Comment" },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Notification = model("Notification", notificationSchema);
