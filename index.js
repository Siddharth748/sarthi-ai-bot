// index.js
// Simple WhatsApp bot via Gupshup + Railway
// Author: Siddharth’s Assistant

const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config(); // Loads GUPSHUP_API_KEY and GUPSHUP_SOURCE from .env
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// Webhook to receive messages
app.post("/webhook", async (req, res) => {
  console.log("Inbound payload:", JSON.stringify(req.body));

  // Extract sender phone + text message safely
  let userPhone = null;
  let userText = null;

  try {
    if (req.body.payload && req.body.payload.sender) {
      userPhone = req.body.payload.sender.phone;
    }
    if (req.body.payload && req.body.payload.payload && req.body.payload.payload.text) {
      userText = req.body.payload.payload.text;
    }
  } catch (err) {
    console.error("Error extracting phone/text:", err);
  }

  console.log("Detected userPhone:", userPhone, " userText:", userText);

  // If no text, just acknowledge and exit
  if (!userText) {
    res.sendStatus(200);
    return;
  }

  // Reply using Gupshup API
  const apiKey = process.env.GUPSHUP_API_KEY;
  const source = process.env.GUPSHUP_SOURCE; // Your WhatsApp number in Gupshup

  if (!apiKey || !source) {
    console.error("Gupshup API key or source not set in environment variables.");
    res.sendStatus(200);
    return;
  }

  try {
    await axios.post(
      "https://api.gupshup.io/sm/api/v1/msg",
      new URLSearchParams({
        channel: "whatsapp",
        source: source,
        destination: userPhone,
        message: `You said: ${userText}`,
        src.name: "SarathiAI" // Your bot name
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          apikey: apiKey
        }
      }
    );
    console.log("Reply sent to", userPhone);
  } catch (err) {
    console.error("Error sending reply:", err.response?.data || err.message);
  }

  res.sendStatus(200);
});

// Railway will assign PORT automatically
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
