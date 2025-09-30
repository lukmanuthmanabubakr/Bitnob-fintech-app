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
      expiresAt: payload.expiresAt, // <--- save here
    });

    res.status(200).json({
      success: true,
      message: "Lightning invoice created successfully",
      invoice: newInvoice,
    });
  } catch (error) {
    console.error(
      "Error creating Lightning invoice:",
      error.response?.data || error.message
    );
    res.status(error.response?.status || 500).json({
      success: false,
      message: "Failed to create Lightning invoice",
      error: error.response?.data || error.message,
    });
  }
});

const initiatePayment = asyncHandler(async (req, res) => {
  const { request } = req.body;

  if (!request || request.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Lightning invoice 'request' is required",
    });
  }

  const invoice = await LightningInvoice.findOne({ request });
  let isExpired = false;
  if (invoice?.expiresAt) {
    isExpired = new Date() > new Date(invoice.expiresAt);
  }

  try {
    console.log("Initiating Lightning payment for invoice:", request);

    if (request.includes("-mocked-")) {
      console.log("Detected sandbox mocked invoice - simulating payment");

      const satAmount = parseInt(request.match(/\d+/)?.[0] || "0");

      const simulatedTx = {
        satFee: Math.ceil(satAmount * 0.005),
        isExpired, // use the calculated expiry here
        satAmount,
        description: "Sandbox mocked invoice",
        request,
        btcFee: 0.00000001,
        btcAmount: satAmount / 1e8,
        fee: Math.ceil(satAmount * 0.005),
        amount: satAmount / 1e8,
      };

      await LightningInvoice.findOneAndUpdate(
        { request },
        { status: isExpired ? "expired" : "checked" }
      );

      return res.status(200).json({
        success: true,
        message: "Sandbox invoice - payment checked successfully",
        transaction: simulatedTx,
      });
    }

    // Real invoice payment
    const response = await bitnobAPI.post("/wallets/ln/initiatepayment", {
      request,
    });
    console.log("API response received:", response.data);

    const txData = response.data?.data;

    if (!txData) {
      console.error(
        "Transaction data missing in Bitnob response:",
        response.data
      );
      return res.status(500).json({
        success: false,
        message: "No transaction data returned from Bitnob",
        details: response.data,
      });
    }

    // Update invoice status
    if (txData.isExpired) {
      await LightningInvoice.findOneAndUpdate(
        { request },
        { status: "expired" }
      );
    } else if (txData.isPaid) {
      await LightningInvoice.findOneAndUpdate({ request }, { status: "paid" });
    } else {
      await LightningInvoice.findOneAndUpdate(
        { request },
        { status: "checked" }
      );
    }

    res.status(200).json({
      success: true,
      message: "Transaction summary fetched successfully",
      transaction: txData,
    });
  } catch (error) {
    console.error(
      "Unexpected error in initiatePayment:",
      error.response?.data || error.message
    );

    res.status(error.response?.status || 500).json({
      success: false,
      message:
        error.response?.data?.message || "Failed to initiate Lightning payment",
      details: error.response?.data || error.message,
    });
  }
});

const payInvoice = asyncHandler(async (req, res) => {
  const { request, reference } = req.body;

  if (!request || request.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Lightning invoice 'request' is required",
    });
  }

  const user = await User.findById(req.user._id);
  if (!user || !user.email) {
    return res.status(400).json({
      success: false,
      message: "Valid user with email is required",
    });
  }

  // Check local invoice for expiry
  const invoice = await LightningInvoice.findOne({ request });
  let isExpired = false;
  if (invoice?.expiresAt) {
    isExpired = new Date() > new Date(invoice.expiresAt);
  }

  try {
    console.log("Processing Lightning payment for invoice:", request);

    // Sandbox/mock invoice
    if (request.includes("-mocked-")) {
      console.log("Detected sandbox mocked invoice - simulating payment");

      const satAmount = parseInt(request.match(/\d+/)?.[0] || "0");

      const simulatedTx = {
        satFee: Math.ceil(satAmount * 0.005),
        isExpired, // calculated expiry
        satAmount,
        description: "Sandbox mocked invoice",
        request,
        btcFee: 0.00000001,
        btcAmount: satAmount / 1e8,
        fee: Math.ceil(satAmount * 0.005),
        amount: satAmount / 1e8,
        status: isExpired ? "expired" : "checked",
      };

      await LightningInvoice.findOneAndUpdate(
        { request },
        { status: isExpired ? "expired" : "checked" }
      );

      return res.status(200).json({
        success: true,
        message: "Sandbox invoice - payment checked successfully",
        transaction: simulatedTx,
      });
    }

    // Real Bitnob payment
    const payload = {
      request,
      customerEmail: user.email,
      reference: reference || `ref-${Date.now()}`, // generate if not provided
    };

    const response = await bitnobAPI.post("/wallets/ln/pay", payload);
    const txData = response.data?.data;

    if (!txData) {
      console.error("No transaction data returned from Bitnob:", response.data);
      return res.status(500).json({
        success: false,
        message: "No transaction data returned from Bitnob",
        details: response.data,
      });
    }

    // Determine status based on API response
    let status = "checked"; // default
    if (txData.status === "pending") status = "checked";
    else if (txData.status === "confirmed") status = "paid";
    else if (txData.status === "failed") status = "failed";

    // Update local invoice
    await LightningInvoice.findOneAndUpdate({ request }, { status });

    res.status(200).json({
      success: true,
      message: "Invoice payment processed successfully",
      transaction: txData,
      status,
    });
  } catch (error) {
    console.error(
      "Error paying Lightning invoice:",
      error.response?.data || error.message
    );

    res.status(error.response?.status || 500).json({
      success: false,
      message:
        error.response?.data?.message || "Failed to pay Lightning invoice",
      details: error.response?.data || error.message,
    });
  }
});

module.exports = {
  createInvoice,
  initiatePayment,
  payInvoice,
};
