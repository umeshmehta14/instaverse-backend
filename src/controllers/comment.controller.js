import { Comment } from "../models/comment.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const addComment = asyncHandler(async (req, res) => {
  const { text } = req.body;
  const { postId } = req.query;
});

export { addComment };
