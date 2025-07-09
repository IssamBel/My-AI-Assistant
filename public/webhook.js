
// Verify this is the correct webhook URL
const WEBHOOK_URL = 'https://issambel.app.n8n.cloud/webhook/7d681245-f864-4cd1-bfba-9de30f588592';

async function sendToWebhook(message) {
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: message // Must use 'message' property
      })
    });
    
    if (!response.ok) {
      console.error('Webhook error:', await response.text());
    }
  } catch (error) {
    console.error('Failed to send webhook:', error);
  }
}

// Make sure this event listener is active
document.addEventListener('phraseCompleted', (event) => {
  sendToWebhook(event.detail.transcript);
});