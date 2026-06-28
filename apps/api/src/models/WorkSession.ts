import { Schema, model, Document, Types } from "mongoose";

export interface IWorkSession extends Document {
  userId: Types.ObjectId;
  deviceId: string;
  startTime: Date;
  endTime?: Date;
  durationMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}

const workSessionSchema = new Schema<IWorkSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    deviceId: {
      type: String,
      required: true,
      trim: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
    },
    durationMinutes: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for query performance
workSessionSchema.index({ userId: 1, startTime: -1 });

export const WorkSession = model<IWorkSession>(
  "WorkSession",
  workSessionSchema,
);
