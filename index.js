require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Bot name
const BOT_NAME = "SarathiAI";

const GS_API_KEY = process.env.GS_API_KEY;
const GS_SOURCE = process.env.GS_SOURCE;

// Webhook endpoint
app.post("/webhook", async (req, res) => {
    try {
        const body = req.body;
        console.log("Inbound payload:", JSON.stringify(body, null, 2));

        // Extract message data
        const userPhone = body?.payload?.sender?.phone;
        const userText = body?.payload?.payload?.text;

        console.log(`Detected userPhone: ${userPhone}  userText: ${userText}`);

        // Prepare bot reply
        const botReply = `Hare Krishna 🙏\n\nYou said: "${userText}"\nThis is ${BOT_NAME} here to assist you.`;

        if (!GS_API_KEY || !GS_SOURCE) {
            console.warn("⚠ Gupshup API key or source not set. Simulating send...");
            console.log(`(Simulated reply to ${userPhone}): ${botReply}`);
        } else {
            // Send real message via Gupshup
            await axios.post(
                "https://api.gupshup.io/sm/api/v1/msg",
                new URLSearchParams({
                    channel: "whatsapp",
                    source: GS_SOURCE,
                    destination: userPhone,
                    message: JSON.stringify({ type: "text", text: botReply }),
                    "src.name": BOT_NAME
                }),
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        apikey: GS_API_KEY
                    }
                }
            );
            console.log(`✅ Reply sent to ${userPhone}`);
        }

        res.sendStatus(200);
    } catch (err) {
        console.error("❌ Error in webhook:", err);
        res.sendStatus(500);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`${BOT_NAME} server running on port ${PORT}`);
});
