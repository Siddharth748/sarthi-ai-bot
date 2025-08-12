require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Simple health check
app.get('/', (req, res) => res.send('Sarthi AI — live'));

// Webhook endpoint for Gupshup
app.post('/webhook', async (req, res) => {
  try {
    console.log('Inbound payload:', JSON.stringify(req.body).slice(0,2000));
    // Acknowledge quickly so Gupshup doesn't retry
    res.status(200).send('OK');

    // Attempt to extract phone and message text from common payload shapes
    const body = req.body || {};
    // Gupshup sandbox payload may vary; we try common keys
    const userPhone = (body?.source) || (body?.from) || (body?.sender) || (body?.payload?.sender) || null;
    const userText = (body?.message?.text) || (body?.payload?.message?.text) || (body?.text) || null;

    console.log('Detected userPhone:', userPhone, ' userText:', userText);

    if (!userPhone) {
      console.log('No user phone detected in payload. Check the logged payload and update extraction logic if needed.');
      return;
    }

    // Compose a simple reply (static) to verify the connection
    const replyText = "🙏 Hare Krishna! This is Sarthi AI. I received your message. How can I help you today?";

    // Send reply via Gupshup send-message API (requires GUPSHUP_API_KEY and GUPSHUP_SOURCE)
    if (!process.env.GUPSHUP_API_KEY || !process.env.GUPSHUP_SOURCE) {
      console.log('Gupshup API key or source not set in environment variables. Reply will not be sent automatically.');
      return;
    }

    // Gupshup expects destination without leading + sign, e.g., 919876543210
    const destination = String(userPhone).replace('+','').replace(/[^0-9]/g,''); 

    const payload = new URLSearchParams();
    payload.append('channel', 'whatsapp');
    payload.append('source', process.env.GUPSHUP_SOURCE);
    payload.append('destination', destination);
    payload.append('message', JSON.stringify({ type: 'text', text: replyText }));

    await axios.post('https://api.gupshup.io/wa/api/v1/msg', payload.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apikey': process.env.GUPSHUP_API_KEY
      },
      timeout: 10000
    });

    console.log('Reply sent to', destination);

  } catch (err) {
    console.error('Webhook handler error:', err?.response?.data || err.message || err);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sarthi AI listening on port ${PORT}`));
