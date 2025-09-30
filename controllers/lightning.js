const asyncHandler = require("express-async-handler");
const bitnobAPI = require("../utils/bitnob");
const LightningInvoice = require("../models/lightning");
const User = require("../models/userModel");

// Create Lightning invoice
const createInvoice = asyncHandler(async (req, res) => {
  const { satoshis, description, expiresAt, descriptionHash } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    console.error("User not found in database");
    res.status(404);
    throw new Error("User not found");
  }

  if (!satoshis || Number(satoshis) <= 0) {
    console.error("Invalid satoshis amount:", satoshis);
    res.status(400);
    throw new Error("Satoshis amount is required and must be greater than 0");
  }

  if (!description || description.trim() === "") {
    console.error("Invalid description:", description);
    res.status(400);
    throw new Error("Description is required");
  }

  const customerEmail = user.email;
  if (!customerEmail) {
    console.error("User email missing for invoice generation!");
    res.status(400);
    throw new Error("User email is required to generate invoice");
  }

  try {
    const payload = {
      satoshis: Number(satoshis),
      customerEmail,
      description,
      expiresAt: expiresAt || new Date(Date.now() + 3600000).toISOString(),
      descriptionHash: descriptionHash || undefined,
    };

    const response = await bitnobAPI.post("/wallets/ln/createinvoice", payload);


    if (!response.data.status) {
      console.error("Bitnob API returned failure:", response.data);
      res.status(500);
      throw new Error("Failed to create Lightning invoice");
    }

    const invoiceData = response.data.data;

    if (!invoiceData.tokens) {
      console.error("Missing 'tokens' in Bitnob response:", invoiceData);
    } else {
      console.log("Tokens from Bitnob:", invoiceData.tokens);
    }

    const newInvoice = await LightningInvoice.create({
      userId: user._id,
      description: invoiceData.description,
      request: invoiceData.request,
      tokens: Number(invoiceData.satoshis),
      status: "pending",
    });


    res.status(200).json({
      success: true,
      message: "Lightning invoice created successfully",
      invoice: newInvoice,
    });
  } catch (error) {
    console.error("Error creating Lightning invoice:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: "Failed to create Lightning invoice",
      error: error.response?.data || error.message,
    });
  }
});

// Initiate Lightning Payment
const initiatePayment = asyncHandler(async (req, res) => {
  const { request } = req.body;

  if (!request || request.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Lightning invoice 'request' is required",
    });
  }

  try {
    console.log("📤 Initiating Lightning payment for invoice:", request);

    const response = await bitnobAPI.post("/wallets/ln/initiatepayment", { request });

    const txData = response.data?.data;

    if (!txData) {
      return res.status(500).json({
        success: false,
        message: "No transaction data returned from Bitnob",
      });
    }

    // Update invoice status if expired
    if (txData.isExpired) {
      await LightningInvoice.findOneAndUpdate(
        { request },
        { status: "expired" }
      );
    }

    res.status(200).json({
      success: true,
      message: "Transaction summary fetched successfully",
      transaction: txData,
    });

  } catch (error) {
    console.error("Error initiating Lightning payment:", error.response?.data || error.message);

    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || "Failed to initiate Lightning payment",
      details: error.response?.data || error.message,
    });
  }
});

module.exports = {
  createInvoice,
  initiatePayment
};
