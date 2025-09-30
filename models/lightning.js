const mongoose = require("mongoose");

const lightning = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    description: { type: String, default: "lightning money" },
    request: { type: String, required: true },
    tokens: { type: Number, required: true },
    status: { type: String, default: "pending" },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LightningInvoice", lightning);
