const nodemailer = require("nodemailer");
const path = require("path");

const sendEmail = async (
  subject,
  send_to,
  sent_from,
  reply_to,
  template,
  name,
  link
) => {
  try {
    // Dynamically import nodemailer-express-handlebars
    const hbs = (await import("nodemailer-express-handlebars")).default;
    const Handlebars = (await import("handlebars")).default;

    // Register the `eq` helper globally
    Handlebars.registerHelper("eq", (a, b) => a === b);

    // Create Email Transporter
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
      timeout: 30000,
    });

    const handlebarOptions = {
      viewEngine: {
        extName: ".handlebars",
        partialsDir: path.resolve("./views"),
        defaultLayout: false,
        helpers: {
          eq: (a, b) => a === b,
        },
      },
      viewPath: path.resolve("./views"),
      extName: ".handlebars",
    };

    transporter.use("compile", hbs(handlebarOptions));

    // Build email context dynamically
    const context = {
      name,
      link
    };

    // Only add `message` if template is 'custom'
    if (template === "custom" && message) {
      context.message = message;
    }

    // Options for sending email
    const options = {
      from: sent_from,
      to: send_to,
      replyTo: reply_to,
      subject,
      template,
      context,
    };

    // Send Email
    const emailResponse = await transporter.sendMail(options);
    console.log(emailResponse);

    return emailResponse;
  } catch (err) {
    console.error("Email sending error:", err);
    throw new Error(err.message || "Something went wrong");
  }
};

module.exports = sendEmail;
