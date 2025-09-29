// src/config/bitnob.js
const axios = require("axios");

const bitnobAPI = axios.create({
  baseURL: process.env.BITNOB_API_URL,
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.BITNOB_SECRET_KEY}`,
  },
});

module.exports = bitnobAPI;
