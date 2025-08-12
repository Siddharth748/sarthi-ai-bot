import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// Debug log env vars at startup (mask sensitive data)
console.log("🚀 SarathiAI starting...");
console.log("📦 GS_API_KEY:", process.env.GS_API_KEY ? "[LOADED]" : "[MISSING]");
console.log("📦 GS_SOURCE:", process.env.GS_SOURCE || "[MISSING]");

app.post("/webhook", async (req, res) => {
    console.log("Inbound payload:", JSON.stringify(req.body, null, 2));

    const payload = req.body.payload || {};
    const sender = payload.sender || {};
    const userPhone = sender.phone;
    const userText = payload.payload?.text || null;

    console.log(`Detected userPhone: ${userPhone}  userText: ${userText}`);

    const GS_API_KEY = process.env.GS_API_KEY;
    const GS_SOURCE = process.env.GS_SOURCE;

    if (!GS_API_KEY || !GS_SOURCE) {
        console.warn("⚠ Gupshup API key or source not set. Simulating send...");
        console.log(`(Simulated reply to ${userPhone}): Hare Krishna 🙏\n\nYou said: "${userText}"\nThis is SarathiAI here to assist you.`);
        return res.sendStatus(200);
    }

    // Send reply via Gupshup API
    try {
        const replyText = `Hare Krishna 🙏\n\nYou said: "${userText}"\nThis is SarathiAI here to assist you.`;

        const response = await fetch("https://api.gupshup.io/sm/api/v1/msg", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "apikey": GS_API_KEY
            },
            body: new URLSearchParams({
                channel: "whatsapp",
                source: GS_SOURCE,
                destination: userPhone,
                message: replyText,
                "src.name": "SarathiAI"
            })
        });

        const data = await response.text();
        console.log("✅ Gupshup send response:", data);
    } catch (err) {
        console.error("❌ Error sending message:", err);
    }

    res.sendStatus(200);
});

app.get("/", (req, res) => {
    res.send("SarathiAI Webhook is running ✅");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`SarathiAI server running on port ${PORT}`);
});
