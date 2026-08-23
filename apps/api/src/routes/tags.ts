import { Router, RequestHandler } from "express";
import { CreateTagSchema, ObjectIdSchema, UpdateTagSchema } from "@repo/validation";
import { requireAuth } from "../middleware/auth";
import { Tag } from "../models/Tag";
import { WorkSession } from "../models/WorkSession";
import {
  findTagForUser,
  isDuplicateKeyError,
  serializeTag,
} from "../utils/tags";

const router: Router = Router();

function tagNameKey(name: string): string {
  return name.trim().toLowerCase();
}

const listTagsHandler: RequestHandler = async (req, res) => {
  try {
    const tags = await Tag.find({ userId: req.userId! }).sort({ nameKey: 1 });
    res.json(tags.map(serializeTag));
  } catch (error) {
    console.error("List tags error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const createTagHandler: RequestHandler = async (req, res) => {
  try {
    const result = CreateTagSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.format() });
      return;
    }

    const name = result.data.name;
    const nameKey = tagNameKey(name);
    const userId = req.userId!;

    const existing = await Tag.findOne({ userId, nameKey });
    if (existing) {
      res.json(serializeTag(existing));
      return;
    }

    try {
      const tag = await Tag.create({ userId, name, nameKey });
      res.status(201).json(serializeTag(tag));
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const raced = await Tag.findOne({ userId, nameKey });
        if (raced) {
          res.json(serializeTag(raced));
          return;
        }
      }
      throw error;
    }
  } catch (error) {
    console.error("Create tag error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateTagHandler: RequestHandler = async (req, res) => {
  try {
    const idResult = ObjectIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(400).json({ error: "Invalid tag id" });
      return;
    }

    const result = UpdateTagSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.format() });
      return;
    }

    const userId = req.userId!;
    const tag = await findTagForUser(userId, idResult.data);
    if (!tag) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }

    const name = result.data.name;
    const nameKey = tagNameKey(name);
    const conflict = await Tag.findOne({
      userId,
      nameKey,
      _id: { $ne: tag._id },
    });
    if (conflict) {
      res.status(409).json({ error: "A tag with that name already exists" });
      return;
    }

    tag.name = name;
    tag.nameKey = nameKey;
    await tag.save();
    res.json(serializeTag(tag));
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      res.status(409).json({ error: "A tag with that name already exists" });
      return;
    }
    console.error("Update tag error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const deleteTagHandler: RequestHandler = async (req, res) => {
  try {
    const idResult = ObjectIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(400).json({ error: "Invalid tag id" });
      return;
    }

    const userId = req.userId!;
    const tag = await findTagForUser(userId, idResult.data);
    if (!tag) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }

    await WorkSession.updateMany(
      { userId, tagId: tag._id },
      { $unset: { tagId: 1 } },
    );
    await tag.deleteOne();
    res.status(204).send();
  } catch (error) {
    console.error("Delete tag error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

router.get("/", requireAuth, listTagsHandler);
router.post("/", requireAuth, createTagHandler);
router.patch("/:id", requireAuth, updateTagHandler);
router.delete("/:id", requireAuth, deleteTagHandler);

export default router;
