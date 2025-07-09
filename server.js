const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// AI Response Storage
let lastAiResponse = ''; // This must be outside the route

app.post('/receive-ai', (req, res) => {
  lastAiResponse = req.body.message || req.body.messsage || ''; // typo-safe
  console.log('📩 Received AI response:', lastAiResponse);
  res.json({ status: 'received' });
});


app.get('/get-ai-reply', (req, res) => {
  res.json({ text: lastAiResponse });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`➡️  POST http://localhost:${PORT}/receive-ai`);
  console.log(`⬅️  GET http://localhost:${PORT}/get-ai-reply`);
});