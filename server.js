'use strict';
const express     = require('express');
const bodyParser  = require('body-parser');
const fccTesting  = require('./freeCodeCamp/fcctesting.js');
const app         = express();

fccTesting(app);

app.use(express.static('public')); // serve static files from /public

app.use(bodyParser.json());

let lastAiReply = null;
const pendingRequests = {};

app.post('/receive-ai', (req, res) => {
  console.log("Received AI response:", req.body);
  lastAiReply = req.body;
  res.json({ status: 'ok' });
});

app.get('/get-ai-reply', (req, res) => {
  if (lastAiReply) {
    const reply = lastAiReply;
    lastAiReply = null; // Clear after sending
    res.json(reply);
  } else {
    res.json({ reply: null });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Listening on port:", PORT);
});
