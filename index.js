// index.js  - paste this entire file replacing your old one
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// health check (open this URL in browser to confirm the app is up)
app.get('/', (req, res) => res.send('Sarthi AI is running ✅'));

/*
  Main webhook: Gupshup will POST incoming messages here.
  This code:
  - logs the full payload (so you can inspect what Gupshup sends)
  - extracts phone and message text in a safe way
  - replies using Gupshup send API if env vars are set
*/
app.post('/webhook', async (req, res) => {
  try {
    console.log('Inbound payload:', JSON.stringify(req.body, null, 2));

    // default extractor that covers common Gupshup shapes
    let userPhone = null;
    let userText  = null;
    const eventType = req.body?.type || null;

    if (eventType === 'message') {
      // common message payload (your logs showed this shape)
      userPhone = req.body.payload?.sender?.phone || req.body.payload?.source || null;
      userText  = req.body.payload?.payload?.text || null;
    } else if (eventType === 'user-event') {
      // sandbox-start and similar events
      userPhone = req.body.payload?.phone || null;
      userText  = null;
    } else {
      // fallback: try a few other places just in case
      userPhone = req.body?.payload?.sender?.phone || req.body?.source || userPhone;
      userText  = req.body?.payload?.payload?.text || req.body?.text || null;
    }

    console.log('Detected userPhone:', userPhone, ' userText:', userText);

    // Immediately ack to Gupshup so it doesn't retry
    res.status(200).send('OK');

    // If API key or source not set, we won't attempt to reply (safe)
    if (!process.env.GUPSHUP_API_KEY || !process.env.GUPSHUP_SOURCE) {
      console.log('Gupshup API key or source not set in environment variables. Reply will not be sent automatically.');
      return;
    }

    // If we don't have a real message text yet, do nothing (this happens on sandbox-start)
    if (!userText) {
      console.log('No user message text available (likely sandbox-start). Waiting for real message.');
      return;
    }

    // Sanitize phone to digits only (Gupshup normally gives e.g. 91842xxxxxxx)
    const destination = String(userPhone).replace(/\D/g, '');

    // Compose a friendly Krishna-style reply (you can change this)
    const replyText = `🙏 Hare Krishna! I heard: "${userText}". I am Sarthi AI — how can I help? — Your Sarthi`;

    // Pick send URL from env (safer than hardcoding). Default kept for convenience.
    const sendUrl = process.env.GUPSHUP_SEND_URL || 'https://api.gupshup.io/wa/api/v1/msg';

    // Prepare form data for Gupshup
    const params = new URLSearchParams();
    params.append('channel', 'whatsapp');
    params.append('source', process.env.GUPSHUP_SOURCE);    // your Gupshup source number
    params.append('destination', destination);               // user phone e.g. 9198xxxxxxx
    params.append('message', JSON.stringify({ type: 'text', text: replyText }));

    // Send the reply
    const resp = await axios.post(sendUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apikey': process.env.GUPSHUP_API_KEY
      },
      timeout: 10000
    });

    console.log('Reply sent:', resp?.data || '(no body)');
  } catch (err) {
    console.error('Webhook handler error:', err?.response?.data || err.message || err);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sarthi AI listening on port ${PORT}`));
