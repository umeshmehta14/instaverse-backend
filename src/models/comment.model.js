import { Schema, model } from "mongoose";

const replySchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
    likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

const commentSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, ref: "Post", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
    likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
    edit: {
      type: Boolean,
    },
    replies: [replySchema],
  },
  { timestamps: true }
);

export const Comment = new model("Comment", commentSchema);
