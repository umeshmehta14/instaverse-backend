import mongoose, { Schema } from "mongoose";

const postSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User" },
    url: {
      type: String,
      required: true,
    },
    caption: {
      type: String,
      required: true,
    },
    likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
    comments: [
      {
        user: { type: Schema.Types.ObjectId, ref: "User" },
        likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
      },
    ],
    publicId: {
      type: String,
    },
  },
  { timestamps: true }
);

export const Posts = mongoose.model("Posts", postSchema);
