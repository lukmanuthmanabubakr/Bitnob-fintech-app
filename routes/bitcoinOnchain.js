const express = require("express");
const { protect, verifiedOnly } = require("../middleware/authMiddleware");
const {
  sendBitcoin,
  generateBitcoinAddress,
  listBitcoinAddresses,
} = require("../controllers/bitcoinOnchain");
const router = express.Router();

router.post("/generate-address", protect, verifiedOnly, generateBitcoinAddress);
router.post("/send-bitcoin", protect, verifiedOnly, sendBitcoin);
router.get("/addresses", protect, verifiedOnly, listBitcoinAddresses);


module.exports = router;
