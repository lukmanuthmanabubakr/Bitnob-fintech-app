require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const userRoute = require("./routes/userRoute");
const bitcoinOnchainRoute = require("./routes/bitcoinOnchain");
const lightningRoute = require("./routes/lightning");
const errorHandler = require("./middleware/errorMiddleware");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(bodyParser.json());

app.use(
  cors({
    origin: ["http://localhost:3000", "https://planitfy.vercel.app"], 
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"], 
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS,PATCH"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization"
  );
  next();
});

app.use("/api/auth", userRoute);
app.use("/api/bitcoin", bitcoinOnchainRoute);
app.use("/api/lightning", lightningRoute);

app.get("/", (req, res) => {
  res.send("Home Page");
});

app.use(errorHandler);

const PORT = process.env.PORT || 7000;

mongoose
  .connect(process.env.MONGO_DB_URL)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on ${PORT}`);
    });
  })
  .catch((err) => console.error(err));
