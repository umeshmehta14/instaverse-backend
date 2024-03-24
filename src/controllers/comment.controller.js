import { Comment } from "../models/comment.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { commentData } from "../utils/commentData.js";

const addComment = asyncHandler(async (req, res) => {
  const { text } = req.body;
  const { postId } = req.query;

  try {
    for (const comment of commentData) {
      const newComment = new Comment(comment);
      await newComment.save();
    }
    console.log("Comments uploaded successfully.");
  } catch (error) {
    console.error("Error uploading comments:", error);
  }
});

export { addComment };
