const asyncHandler = require("express-async-handler");
const bitnobAPI = require("../utils/bitnob");
const BitcoinTransaction = require("../models/bitcoinOnchain");
const BitcoinAddress = require("../models/bitcoinAddress");
const User = require("../models/userModel");

const generateBitcoinAddress = asyncHandler(async (req, res) => {
  // Get user
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  try {
    // ✅ Check if wallet address already exists for this user
    const existingAddress = await BitcoinAddress.findOne({ userId: user._id });
    if (existingAddress) {
      return res.status(400).json({
        success: false,
        message: "Wallet address already exists for this user",
        address: existingAddress, // send back existing address if you want
      });
    }

    const payload = {
      label: label || "temporary wallet",
      customerEmail: user.email,
      formatType: formatType || "bip21",
      amount: amount || "regular",
    };

    // Call Bitnob API to generate address
    const response = await bitnobAPI.post("/addresses/generate", payload);

    if (!response.data.status) {
      res.status(500);
      throw new Error("Failed to generate address");
    }

    const addrData = response.data.data;

    // Save address in DB
    const newAddress = await BitcoinAddress.create({
      userId: user._id,
      address: addrData.address,
      label: addrData.label,
      addressType: addrData.addressType,
    });

    res.status(200).json({
      success: true,
      message: "Bitcoin address generated and saved",
      address: newAddress,
    });
  } catch (error) {
    console.error(
      "Error generating Bitcoin address:",
      error.response?.data || error.message
    );
    res.status(error.response?.status || 500).json({
      success: false,
      message: "Failed to generate Bitcoin address",
      error: error.response?.data || error.message,
    });
  }
});

const sendBitcoin = asyncHandler(async (req, res) => {
  const { amount, address, description, priorityLevel } = req.body;

  if (!amount || !address) {
    res.status(400);
    throw new Error("Amount and address are required");
  }

  // Get user from auth
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  try {
    const satoshis = Number(amount);

    if (!satoshis || satoshis <= 0) {
      res.status(400);
      throw new Error("Amount must be a positive number in satoshis");
    }

    const payload = {
      satoshis,
      address,
      customerEmail: user.email,
      description: description || "",
      priorityLevel: priorityLevel || "regular",
    };

    // Call Bitnob API
    const response = await bitnobAPI.post("/wallets/send_bitcoin", payload);
    const txData = response.data.data;

    // Save in DB
    const newTransaction = await BitcoinTransaction.create({
      userId: req.user._id,
      reference: txData.reference,
      amount: txData.satAmount,
      btcAmount: txData.btcAmount,
      fees: txData.satFees,
      address: txData.address,
      description: txData.description,
      priorityLevel: txData.priorityLevel,
      status: txData.status,
      action: txData.action,
      hash: txData.hash,
    });

    res.status(200).json({
      success: true,
      message: "Transaction successfully submitted and saved",
      transaction: newTransaction,
    });
  } catch (error) {
    console.error(
      "Error sending Bitcoin:",
      error.response?.data || error.message
    );
    res.status(error.response?.status || 500).json({
      success: false,
      message: "Failed to send Bitcoin",
      error: error.response?.data || error.message,
    });
  }
});

const listBitcoinAddresses = asyncHandler(async (req, res) => {
  try {
    // Call Bitnob API
    const response = await bitnobAPI.get("/addresses");

    if (!response.data.status) {
      res.status(500);
      throw new Error("Failed to fetch addresses from Bitnob");
    }

    const addresses = response.data.data.address || [];

    res.status(200).json({
      success: true,
      message: "Addresses fetched successfully",
      addresses,
      meta: response.data.data.meta, // pagination info
    });
  } catch (error) {
    console.error(
      "Error fetching Bitcoin addresses:",
      error.response?.data || error.message
    );
    res.status(error.response?.status || 500).json({
      success: false,
      message: "Failed to fetch Bitcoin addresses",
      error: error.response?.data || error.message,
    });
  }
});

module.exports = {
  sendBitcoin,
  generateBitcoinAddress,
  listBitcoinAddresses
};
