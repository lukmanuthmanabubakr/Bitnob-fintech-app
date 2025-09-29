const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");
const bcrypt = require("bcryptjs");
const { generateToken, hashToken } = require("../utils");
var parser = require("ua-parser-js");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendEmail");
const Token = require("../models/tokenModel");
const crypto = require("crypto");
const Cryptr = require("cryptr");
const bitnobAPI = require("../utils/bitnob");

const cryptr = new Cryptr(process.env.CRYPTR_KEY);

//To Register User
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  // Validation
  if (!name || !email || !password || !phone) {
    res.status(400);
    throw new Error("Please fill in all the required fields.");
  }

  if (password.length < 6) {
    res.status(400);
    throw new Error("Password must be up to 6 characters.");
  }

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("Email already in use.");
  }

  // Step 1: Create Bitnob customer
  const bitnobRes = await bitnobAPI.post("/customers", {
    email,
    firstName: name.split(" ")[0] || "User",
    lastName: name.split(" ")[1] || "Bitnob",
    phone: phone,
  });

  const customerId = bitnobRes?.data?.data?.id;
  if (!customerId) {
    return res.status(400).json({
      success: false,
      message: "Failed to get customerId from Bitnob response",
      raw: bitnobRes.data,
    });
  }

  // Get UserAgent
  const ua = parser(req.headers["user-agent"]);
  const userAgent = [ua.ua];

  // Step 2: Save user in MongoDB
  const user = await User.create({
    name,
    email,
    password,
    phone,
    userAgent,
    bitnobCustomerId: customerId, // ✅ store Bitnob customerId
  });

  // Generate Token
  const token = generateToken(user._id);

  // Send HTTP-only cookie
  res.cookie("token", token, {
    path: "/",
    httpOnly: true,
    expires: new Date(Date.now() + 1000 * 86400), // 1 day
    sameSite: "none",
    secure: true,
  });

  if (user) {
    const {
      _id,
      name,
      email,
      phone,
      bio,
      photo,
      role,
      isVerified,
      bitnobCustomerId,
    } = user;

    res.status(201).json({
      _id,
      name,
      email,
      phone,
      bio,
      photo,
      role,
      isVerified,
      bitnobCustomerId,
      token,
    });
  } else {
    res.status(400);
    throw new Error("Invalid user data");
  }
});

//To Login User
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !password) {
    res.status(400);
    throw new Error("Please add email and password");
  }

  const user = await User.findOne({ email });

  if (!user) {
    res.status(404);
    throw new Error("User not found, please signup");
  }


  const passwordIsCorrect = await bcrypt.compare(password, user.password);

  if (!passwordIsCorrect) {
    res.status(400);
    throw new Error("Invalid email or password");
  }

  // Trigger 2FA for unknown UserAgent
  const ua = parser(req.headers["user-agent"]);
  const thisUserAgent = ua.ua;
  const allowedAgent = user.userAgent.includes(thisUserAgent);

  if (!allowedAgent) {
    // Generate 6 digit code
    const loginCode = Math.floor(100000 + Math.random() * 900000);

    // Encrypt login code before saving
    const encryptedLoginCode = cryptr.encrypt(loginCode.toString());

    // Delete old token if exists
    let userToken = await Token.findOne({ userId: user._id });
    if (userToken) {
      await userToken.deleteOne();
    }

    // Save new token
    await new Token({
      userId: user._id,
      lToken: encryptedLoginCode,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60 * 60 * 1000, // 60 mins
    }).save();

    res.status(400);
    throw new Error("New browser or device detected. Verification required.");
  }

  // Generate Token
  const token = generateToken(user._id);

  if (user && passwordIsCorrect) {
    // Send HTTP-only cookie
    res.cookie("token", token, {
      path: "/",
      httpOnly: true,
      expires: new Date(Date.now() + 1000 * 86400), // 1 day
      sameSite: "none",
      secure: true,
    });

    // ✅ Include Bitnob customerId in response
    const {
      _id,
      name,
      email,
      phone,
      bio,
      photo,
      role,
      isVerified,
      bitnobCustomerId,
    } = user;

    res.status(200).json({
      _id,
      name,
      email,
      phone,
      bio,
      photo,
      role,
      isVerified,
      bitnobCustomerId, // ✅ available after register
      token,
    });
  } else {
    res.status(500);
    throw new Error("Something went wrong, please try again");
  }
});

//To Log-out User
const logoutUser = asyncHandler(async (req, res) => {
  res.cookie("token", "", {
    path: "/",
    httpOnly: true,
    expires: new Date(0), // 1 day
    sameSite: "none",
    secure: true,
  });
  return res.status(200).json({ message: "Logout successful" });
});

//To Get A User
const getUser = asyncHandler(async (req, res) => {
  // 1️⃣ Fetch user from MongoDB
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Destructure user fields
  const { _id, name, email, phone, bio, photo, role, isVerified, bitnobCustomerId } = user;

  let bitnobCustomer = null;

  // 2️⃣ Fetch Bitnob customer if customerId exists
  if (bitnobCustomerId) {
    try {
      const response = await bitnobAPI.get(`/customers/${bitnobCustomerId}`);
      bitnobCustomer = response.data.data || null;
    } catch (error) {
      console.error("Error fetching Bitnob customer:", error.response?.data || error.message);
      // Optionally, you can continue without Bitnob data
    }
  }

  // 3️⃣ Send combined response
  res.status(200).json({
    _id,
    name,
    email,
    phone,
    bio,
    photo,
    role,
    isVerified,
    bitnobCustomer, // ✅ includes Bitnob data or null if failed
  });
});

//To Update A User
const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Destructure current user fields
  const { name, email, phone, bio, photo, role, isVerified, bitnobCustomerId } = user;

  // Update local MongoDB user fields
  user.name = req.body.name || name;
  user.phone = req.body.phone || phone;
  user.bio = req.body.bio || bio;
  user.photo = req.body.photo || photo;

  // Keep email only if explicitly changed
  if (req.body.email && req.body.email !== email) {
    user.email = req.body.email;
  }

  // Save updates to MongoDB
  const updatedUser = await user.save();

  let bitnobCustomer = null;

  // If user has Bitnob customerId, sync changes to Bitnob
  if (bitnobCustomerId) {
    try {
      const [firstName, ...rest] = updatedUser.name.split(" ");
      const lastName = rest.join(" ") || "Bitnob";

      const response = await bitnobAPI.put(`/customers/${bitnobCustomerId}`, {
        firstName,
        lastName,
        email: updatedUser.email,
        phone: updatedUser.phone,
        // Optional: countryCode if you want to allow updates from frontend
        ...(req.body.countryCode && { countryCode: req.body.countryCode }),
      });

      bitnobCustomer = response.data.data || null;
    } catch (err) {
      console.error("Error updating Bitnob customer:", err.response?.data || err.message);
      // Don’t block MongoDB updates even if Bitnob fails
    }
  }

  // Final response with merged data
  res.status(200).json({
    _id: updatedUser._id,
    name: updatedUser.name,
    email: updatedUser.email,
    phone: updatedUser.phone,
    bio: updatedUser.bio,
    photo: updatedUser.photo,
    role: updatedUser.role,
    isVerified: updatedUser.isVerified,
    bitnobCustomer, // ✅ sync result from Bitnob (or null if failed)
  });
});

// To List Users (Local + Bitnob)
const getUsers = asyncHandler(async (req, res) => {
  try {
    // Fetch from local MongoDB
    const users = await User.find()
      .sort("-createdAt")
      .select("-password");

    // Fetch from Bitnob API
    const response = await bitnobAPI.get("/customers/");

    return res.status(200).json({
      success: true,
      message: "Users successfully fetched",
      localUsers: users || [],
      bitnobCustomers: response.data?.data?.customers || [],
      meta: response.data?.data?.meta || null, // pagination info if available
    });
  } catch (err) {
    console.error("Error fetching users:", err.response?.data || err.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: err.response?.data || err.message,
    });
  }
});

//To check Login status of a user
const loginStatus = asyncHandler(async (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.json(false);
  }

  // Verify token
  const verified = jwt.verify(token, process.env.JWT_SECRET);

  if (verified) {
    return res.json(true);
  }
  return res.json(false);
});

//To Upgrade user
const upgradeUser = asyncHandler(async (req, res) => {
  const { role, id } = req.body;

  const user = await User.findById(id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  user.role = role;
  await user.save();

  res.status(200).json({
    message: `User role updated to ${role}`,
  });
});

//To Send Automated Email
const sendAutomatedEmail = asyncHandler(async (req, res) => {
  const { subject, send_to, reply_to, template, url } = req.body;

  if (!subject || !send_to || !reply_to || !template) {
    res.status(500);
    throw new Error("Missing email parameter");
  }

  // Get user
  const user = await User.findOne({ email: send_to });

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const sent_from = process.env.EMAIL_USER;
  const name = user.name;
  const link = `${process.env.FRONTEND_URL}${url}`;

  try {
    await sendEmail(
      subject,
      send_to,
      sent_from,
      reply_to,
      template,
      name,
      link
    );
    res.status(200).json({ message: "Email Sent" });
  } catch (error) {
    res.status(500);
    throw new Error("Email not sent, please try again");
  }
});

//To send verification Email
const sendVerificationEmail = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  if (user.isVerified) {
    res.status(400);
    throw new Error("User already verified");
  }

  // Delete Token if it exists in DB
  let token = await Token.findOne({ userId: user._id });
  if (token) {
    await token.deleteOne();
  }

  //   Create Verification Token and Save
  const verificationToken = crypto.randomBytes(32).toString("hex") + user._id;
  console.log(verificationToken);
  // res.send('Token')

  // Hash token and save
  const hashedToken = hashToken(verificationToken);
  await new Token({
    userId: user._id,
    vToken: hashedToken,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60 * (60 * 1000), // 60mins
  }).save();

  // Construct Verification URL
  const verificationUrl = `${process.env.FRONTEND_URL}/verify/${verificationToken}`;

  // Send Email
  const subject = "Verify Your Account - PlanIt";
  const send_to = user.email;
  const sent_from = process.env.EMAIL_USER;
  const reply_to = "noreply@PlanIt.com";
  const template = "verifyEmail";
  const name = user.name;
  const link = verificationUrl;

  try {
    await sendEmail(
      subject,
      send_to,
      sent_from,
      reply_to,
      template,
      name,
      link
    );
    res.status(200).json({ message: "Verification Email Sent" });
  } catch (error) {
    res.status(500);
    throw new Error("Email not sent, please try again");
  }
});

//To Verify User TOKEN
const verifyUser = asyncHandler(async (req, res) => {
  const { verificationToken } = req.params;

  const hashedToken = hashToken(verificationToken);

  const userToken = await Token.findOne({
    vToken: hashedToken,
    expiresAt: { $gt: Date.now() },
  });

  if (!userToken) {
    res.status(404);
    throw new Error("Invalid or Expired Token");
  }

  // Find User
  const user = await User.findOne({ _id: userToken.userId });

  if (user.isVerified) {
    res.status(400);
    throw new Error("User is already verified");
  }

  // Now verify user
  user.isVerified = true;
  await user.save();

  res.status(200).json({ message: "Account Verification Successful" });
});

//Forgot password
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    res.status(404);
    throw new Error("No user with this email");
  }

  // Delete Token if it exists in DB
  let token = await Token.findOne({ userId: user._id });
  if (token) {
    await token.deleteOne();
  }

  //   Create Verification Token and Save
  const resetToken = crypto.randomBytes(32).toString("hex") + user._id;
  console.log(resetToken);

  // Hash token and save
  const hashedToken = hashToken(resetToken);
  await new Token({
    userId: user._id,
    rToken: hashedToken,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60 * (60 * 1000), // 60mins
  }).save();

  // Construct Reset URL
  const resetUrl = `${process.env.FRONTEND_URL}/resetPassword/${resetToken}`;

  // Send Email
  const subject = "Password Reset Request - PlanIt";
  const send_to = user.email;
  const sent_from = process.env.EMAIL_USER;
  const reply_to = "noreply@PlanIt.com";
  const template = "forgotPassword";
  const name = user.name;
  const link = resetUrl;

  try {
    await sendEmail(
      subject,
      send_to,
      sent_from,
      reply_to,
      template,
      name,
      link
    );
    res.status(200).json({ message: "Password Reset Email Sent" });
  } catch (error) {
    res.status(500);
    throw new Error("Email not sent, please try again");
  }
});

//To reset password
const resetPassword = asyncHandler(async (req, res) => {
  const { resetToken } = req.params;
  const { password } = req.body;
  // console.log(resetToken);
  // console.log(password);

  const hashedToken = hashToken(resetToken);

  const userToken = await Token.findOne({
    rToken: hashedToken,
    expiresAt: { $gt: Date.now() },
  });

  if (!userToken) {
    res.status(404);
    throw new Error("Invalid or Expired Token");
  }

  // Find User
  const user = await User.findOne({ _id: userToken.userId });

  // Now Reset password
  user.password = password;
  await user.save();

  res.status(200).json({ message: "Password Reset Successful, please login" });
});

//To change the password
const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, password } = req.body;
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  if (!oldPassword || !password) {
    res.status(400);
    throw new Error("Please enter old and new password");
  }

  // Check if old password is correct
  const passwordIsCorrect = await bcrypt.compare(oldPassword, user.password);

  // Save new password
  if (user && passwordIsCorrect) {
    user.password = password;
    await user.save();

    res
      .status(200)
      .json({ message: "Password change successful, please re-login" });
  } else {
    res.status(400);
    throw new Error("Old password is incorrect");
  }
});

//To send login code
const sendLoginCode = asyncHandler(async (req, res) => {
  const { email } = req.params;
  const user = await User.findOne({ email });

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Find Login Code in DB
  let userToken = await Token.findOne({
    userId: user._id,
    expiresAt: { $gt: Date.now() },
  });

  if (!userToken) {
    res.status(404);
    throw new Error("Invalid or Expired token, please login again");
  }

  const loginCode = userToken.lToken;
  const decryptedLoginCode = cryptr.decrypt(loginCode);

  // Send Login Code
  const subject = "Login Access Code - PlanIt";
  const send_to = email;
  const sent_from = process.env.EMAIL_USER;
  const reply_to = "noreply@zino.com";
  const template = "loginCode";
  const name = user.name;
  const link = decryptedLoginCode;

  try {
    await sendEmail(
      subject,
      send_to,
      sent_from,
      reply_to,
      template,
      name,
      link
    );
    res.status(200).json({ message: `Access code sent to ${email}` });
  } catch (error) {
    res.status(500);
    throw new Error("Email not sent, please try again");
  }
});

//For User to login with code
const loginWithCode = asyncHandler(async (req, res) => {
  const { email } = req.params;
  const { loginCode } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const userToken = await Token.findOne({
    userId: user.id,
    expiresAt: { $gt: Date.now() },
  });

  if (!userToken) {
    res.status(404);
    throw new Error("Invalid or Expired Token, please login again");
  }

  const decryptedLoginCode = cryptr.decrypt(userToken.lToken);

  if (loginCode !== decryptedLoginCode) {
    res.status(400);
    throw new Error("Incorrect login code, please try again");
  } else {
    // Register userAgent
    const ua = parser(req.headers["user-agent"]);
    const thisUserAgent = ua.ua;
    user.userAgent.push(thisUserAgent);
    await user.save();

    // Generate Token
    const token = generateToken(user._id);

    // Send HTTP-only cookie
    res.cookie("token", token, {
      path: "/",
      httpOnly: true,
      expires: new Date(Date.now() + 1000 * 86400), // 1 day
      sameSite: "none",
      secure: true,
    });

    const { _id, name, email, phone, bio, photo, role, isVerified } = user;

    res.status(200).json({
      _id,
      name,
      email,
      phone,
      bio,
      photo,
      role,
      isVerified,
      token,
    });
  }
});



module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  getUser,
  updateUser,
  // deleteUser,
  getUsers,
  loginStatus,
  upgradeUser,
  sendAutomatedEmail,
  sendVerificationEmail,
  verifyUser,
  forgotPassword,
  resetPassword,
  changePassword,
  sendLoginCode,
  loginWithCode,
};

// res.send('Log out user')
