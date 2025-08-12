// index.js
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Gupshup config
const GS_API_KEY = process.env.GS_API_KEY; // your Gupshup API key
const GS_SOURCE = process.env.GS_SOURCE;   // your Gupshup WhatsApp number
const BOT_NAME = "SarathiAI";

// Webhook for incoming messages from Gupshup
app.post("/webhook", async (req, res) => {
    try {
        const payload = req.body;

        // Debug: Log the incoming payload
        console.log("Inbound payload:", JSON.stringify(payload, null, 2));

        // Extract message text safely
        let userText = null;
        if (payload?.payload?.type === "text") {
            userText = payload.payload.payload?.text || payload.payload.payload?.text?.trim();
        }

        // Extract sender phone number
        const userPhone = payload?.sender?.phone || payload?.payload?.sender?.phone || null;

        console.log("Detected userPhone:", userPhone, " userText:", userText);

        if (!userPhone || !userText) {
            console.log("❌ Missing phone or message text — skipping reply.");
            return res.sendStatus(200);
        }

        // Simple reply logic
        const replyText = `Hare Krishna 🙏, you said: "${userText}". This is ${BOT_NAME} at your service.`;

        // Send reply via Gupshup API
        if (!GS_API_KEY || !GS_SOURCE) {
            console.error("❌ Gupshup API key or source not set in environment variables.");
        } else {
            await axios.post(
                "https://api.gupshup.io/wa/api/v1/msg",
                {
                    channel: "whatsapp",
                    source: GS_SOURCE,
                    destination: userPhone,
                    message: JSON.stringify({ type: "text", text: replyText }),
                    src: { name: BOT_NAME }
                },
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        apikey: GS_API_KEY
                    }
                }
            );
            console.log("✅ Reply sent to", userPhone);
        }

        res.sendStatus(200);

    } catch (error) {
        console.error("❌ Error handling webhook:", error);
        res.sendStatus(500);
    }
});

// Root route
app.get("/", (req, res) => {
    res.send(`${BOT_NAME} is running`);
});

app.listen(PORT, () => {
    console.log(`🚀 ${BOT_NAME} is live on port ${PORT}`);
});
