import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

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
    publicId: {
      type: String,
    },
    edit: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

postSchema.plugin(mongooseAggregatePaginate);

export const Posts = mongoose.model("Posts", postSchema);
