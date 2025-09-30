const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { createInvoice, initiatePayment, payInvoice } = require("../controllers/lightning");

const router = express.Router();

router.post("/create", protect, createInvoice);
router.post("/initiate-payment", protect, initiatePayment);
router.post("/pay", protect, payInvoice);

module.exports = router;
