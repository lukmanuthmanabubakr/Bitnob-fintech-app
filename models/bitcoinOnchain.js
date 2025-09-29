const mongoose = require("mongoose");

const bitcoinTransactionSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    reference: { type: String, required: true },
    amount: { type: Number, required: true }, // satoshis
    btcAmount: { type: Number },
    fees: { type: Number },
    address: { type: String, required: true },
    description: { type: String },
    priorityLevel: { type: String, default: "regular" },
    status: { type: String, default: "pending" },
    action: { type: String, default: "send_bitcoin" },
    hash: { type: String },
  },
  { timestamps: true }
);

const BitcoinTransaction = mongoose.model("BitcoinTransaction", bitcoinTransactionSchema);

module.exports = BitcoinTransaction;
