import { Schema, model, Document, Types } from "mongoose";

export interface ITag extends Document {
  userId: Types.ObjectId;
  name: string;
  nameKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const tagSchema = new Schema<ITag>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    nameKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 50,
    },
  },
  {
    timestamps: true,
  },
);

tagSchema.index({ userId: 1, nameKey: 1 }, { unique: true });
tagSchema.index({ userId: 1, createdAt: 1 });

export const Tag = model<ITag>("Tag", tagSchema);
