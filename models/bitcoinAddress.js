const mongoose = require("mongoose");

const bitcoinAddressSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    label: { type: String, default: "temporary" },
    addressType: { type: String, default: "bech32" },
    used: { type: Boolean, default: false }, // mark if funds were received
  },
  { timestamps: true }
);

const BitcoinAddress = mongoose.model("BitcoinAddress", bitcoinAddressSchema);

module.exports = BitcoinAddress;
