import { Schema, model, models } from "mongoose";

const ExtensionSessionSchema = new Schema({
  _id: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  lastUsedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export default models.ExtensionSession || model("ExtensionSession", ExtensionSessionSchema);
