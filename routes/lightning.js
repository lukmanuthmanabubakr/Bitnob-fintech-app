const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { createInvoice, initiatePayment } = require("../controllers/lightning");

const router = express.Router();

router.post("/create", protect, createInvoice);
router.post("/initiate-payment", protect, initiatePayment);

module.exports = router;
