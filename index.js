// index.js — DEBUG VERSION - FIND THE ISSUE
import dotenv from "dotenv";
dotenv.config();

import express from "express";
const app = express();

// MIDDLEWARE - Log EVERY request
app.use((req, res, next) => {
    console.log(`📍 INCOMING ${req.method} ${req.path}`);
    console.log(`📍 Headers:`, req.headers);
    console.log(`📍 Query:`, req.query);
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const PORT = process.env.PORT || 8080;

/* ---------------- LOG EVERYTHING ENDPOINT ---------------- */
app.post("/webhook", async (req, res) => {
    console.log("🎯🎯🎯 WEBHOOK HIT! 🎯🎯🎯");
    console.log("📍 FULL REQUEST BODY:", JSON.stringify(req.body, null, 2));
    console.log("📍 HEADERS:", req.headers);
    
    // Always respond immediately
    res.status(200).json({ 
        status: "success", 
        message: "Webhook received",
        timestamp: new Date().toISOString()
    });
    
    // Check if we have a valid message
    if (req.body) {
        console.log("📍 BODY EXISTS, checking format...");
        
        // Check Heltar format
        if (req.body.messages && Array.isArray(req.body.messages)) {
            console.log("📍 HELTAR FORMAT DETECTED");
            req.body.messages.forEach((msg, index) => {
                console.log(`📍 Message ${index}:`, {
                    from: msg.clientWaNumber,
                    text: msg.message?.text,
                    type: msg.message?.type
                });
            });
        }
        
        // Check Meta format
        if (req.body.entry && Array.isArray(req.body.entry)) {
            console.log("📍 META FORMAT DETECTED");
            req.body.entry.forEach((entry, entryIndex) => {
                entry.changes?.forEach((change, changeIndex) => {
                    change.value?.messages?.forEach((msg, msgIndex) => {
                        console.log(`📍 Message ${entryIndex}-${changeIndex}-${msgIndex}:`, {
                            from: msg.from,
                            text: msg.text?.body,
                            type: msg.type
                        });
                    });
                });
            });
        }
        
        // Check simple format
        if (req.body.from && req.body.text) {
            console.log("📍 SIMPLE FORMAT DETECTED");
            console.log(`📍 From: ${req.body.from}, Text: ${req.body.text}`);
        }
        
        if (!req.body.messages && !req.body.entry && !req.body.from) {
            console.log("📍 UNKNOWN FORMAT - but body exists");
        }
    } else {
        console.log("📍 NO BODY IN REQUEST");
    }
    
    console.log("🎯 WEBHOOK PROCESSING COMPLETE");
});

/* ---------------- HEALTH CHECK ---------------- */
app.get("/health", (req, res) => {
    console.log("📍 HEALTH CHECK HIT");
    res.json({ 
        status: "alive", 
        timestamp: new Date().toISOString(),
        message: "Server is running and receiving requests"
    });
});

/* ---------------- WEBHOOK VERIFICATION ---------------- */
app.get("/webhook", (req, res) => {
    console.log("📍 WEBHOOK VERIFICATION HIT");
    console.log("📍 Query params:", req.query);
    
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    console.log(`📍 Verification: mode=${mode}, token=${token}, challenge=${challenge}`);
    
    if (mode === 'subscribe') {
        res.status(200).send(challenge);
        console.log("✅ Webhook verified");
    } else {
        res.sendStatus(200);
        console.log("ℹ️ GET webhook received but not verification");
    }
});

/* ---------------- CATCH ALL - LOG ANY REQUEST ---------------- */
app.all("*", (req, res) => {
    console.log(`📍 UNHANDLED ROUTE: ${req.method} ${req.path}`);
    console.log("📍 Headers:", req.headers);
    console.log("📍 Query:", req.query);
    res.status(404).json({ error: "Route not found", path: req.path });
});

/* ---------------- START SERVER ---------------- */
app.listen(PORT, () => {
    console.log(`\n🔍 DEBUG SERVER STARTED on port ${PORT}`);
    console.log("📝 Endpoints available:");
    console.log("   POST /webhook - for webhook messages");
    console.log("   GET  /webhook - for verification");
    console.log("   GET  /health  - for health checks");
    console.log("\n🎯 NOW: Test if webhooks are reaching your server:");
    console.log("1. Send a message to your bot on WhatsApp");
    console.log("2. Check these logs for 'WEBHOOK HIT!' message");
    console.log("3. If no logs appear, the webhook isn't reaching your server");
});
