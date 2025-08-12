app.post("/webhook", (req, res) => {
    try {
        const body = req.body;

        // Extract phone details safely
        const userPhone = body.payload?.sender || null;

        // Extract text safely (double payload nesting in Gupshup)
        let userText = null;
        if (body.payload?.type === "text") {
            userText = body.payload?.payload?.text || null;
        }

        console.log("Detected userPhone:", userPhone, " userText:", userText);

        // Respond to Gupshup quickly to avoid timeout
        res.status(200).send("OK");

        // Example: reply to user (only if API key & source are set in Railway ENV)
        if (process.env.GUPSHUP_API_KEY && process.env.GUPSHUP_SOURCE) {
            if (userText) {
                sendGupshupMessage(userPhone.phone, "You said: " + userText);
            }
        } else {
            console.warn("Gupshup API key or source not set in environment variables. Reply will not be sent automatically.");
        }

    } catch (error) {
        console.error("Error processing webhook:", error);
        res.status(500).send("Error");
    }
});

// Function to send a message via Gupshup
function sendGupshupMessage(to, text) {
    const axios = require("axios");
    axios.post("https://api.gupshup.io/wa/api/v1/msg", {
        channel: "whatsapp",
        source: process.env.GUPSHUP_SOURCE,
        destination: to,
        message: { type: "text", text: text }
    }, {
        headers: {
            apikey: process.env.GUPSHUP_API_KEY,
            "Content-Type": "application/json"
        }
    })
    .then(res => console.log("Message sent:", res.data))
    .catch(err => console.error("Error sending message:", err.response?.data || err));
}
