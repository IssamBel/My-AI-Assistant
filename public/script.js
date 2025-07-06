const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const output = document.getElementById('output');

let recognition;
let finalTranscript = '';
let silenceTimeout;
let isSpeaking = false;
let pollingInterval = null;
const POLLING_INTERVAL = 1000;
const POLLING_TIMEOUT = 15000;
const SILENCE_DELAY = 1000; // 1 second silence detection

// Initialize speech recognition
if ('webkitSpeechRecognition' in window) {
  recognition = new webkitSpeechRecognition();
} else if ('SpeechRecognition' in window) {
  recognition = new SpeechRecognition();
} else {
  alert("Speech Recognition not supported in this browser.");
}

if (recognition) {
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    appendStatusMessage("Listening...");
    finalTranscript = '';
    isSpeaking = false;
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + ' ';
      } else {
        interimTranscript += transcript;
      }
    }
    
    updateLatestUserBubble(finalTranscript.trim(), interimTranscript);
    
    // Reset the silence timer whenever we get new results
    clearTimeout(silenceTimeout);
    silenceTimeout = setTimeout(() => {
      if (finalTranscript.trim() !== '' && !isSpeaking) {
        recognition.stop();
      }
    }, SILENCE_DELAY);
  };

  recognition.onerror = (event) => {
    console.error("Speech Recognition Error:", event.error);
    appendStatusMessage("Error: " + event.error, 'error');
    stopPolling();
    isSpeaking = false;
  };

  recognition.onend = () => {
    startBtn.disabled = false;
    stopBtn.disabled = true;

    if (finalTranscript.trim() !== '' && !isSpeaking) {
      sendToN8N(finalTranscript.trim());
    } else if (finalTranscript.trim() === '') {
      appendStatusMessage("No speech detected. Click Start to try again.", 'info');
      stopPolling();
    }
  };

  startBtn.addEventListener('click', () => {
    if (isSpeaking) return;
    clearChat();
    startRecognition();
  });

  stopBtn.addEventListener('click', () => {
    clearTimeout(silenceTimeout);
    recognition.stop();
    stopPolling();
    isSpeaking = false;
  });
}

function clearChat() {
  output.innerHTML = '';
}

function appendStatusMessage(msg, type = 'info') {
  const div = document.createElement('div');
  div.className = `status-message ${type}`;
  div.textContent = msg;
  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
}

function updateLatestUserBubble(finalText, interimText) {
  const lastUserBubble = output.querySelector('.chat-bubble.user:last-child');
  
  if (finalText) {
    // Final text received, create permanent bubble
    if (lastUserBubble && !lastUserBubble.classList.contains('final')) {
      output.removeChild(lastUserBubble);
    }
    appendUserMessage(finalText, true);
  } else if (interimText) {
    // Interim text, update temporary bubble
    if (lastUserBubble && !lastUserBubble.classList.contains('final')) {
      lastUserBubble.textContent = interimText;
    } else {
      appendUserMessage(interimText, false);
    }
  }
  
  output.scrollTop = output.scrollHeight;
}

function appendUserMessage(text, isFinal) {
  const div = document.createElement('div');
  div.className = `chat-bubble user ${isFinal ? 'final' : 'interim'}`;
  div.textContent = text;
  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
}

function appendAiMessage(text) {
  // Remove any interim AI messages
  const existingAi = output.querySelector('.chat-bubble.ai.interim');
  if (existingAi) {
    output.removeChild(existingAi);
  }

  const div = document.createElement('div');
  div.className = 'chat-bubble ai final';
  div.innerHTML = formatAIResponse(text);
  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
}

function formatAIResponse(text) {
  // Simple formatting for AI responses
  return text.split('\n').filter(line => line.trim()).join('<br>');
}

function sendToN8N(text) {
  isSpeaking = true;
  appendStatusMessage("AI is thinking...", 'status');
  stopPolling();

  const pollingTimeout = setTimeout(() => {
    stopPolling();
    appendAiMessage("⚠️ Response timeout. Please try again.");
    isSpeaking = false;
  }, POLLING_TIMEOUT);

  pollingInterval = setInterval(() => {
    fetch('/get-ai-reply')
    .then(response => {
      if (!response.ok) throw new Error('Polling request failed');
      return response.json();
    })
    .then(data => {
      if (data.reply) {
        clearTimeout(pollingTimeout);
        stopPolling();
        processAiResponse(data.reply);
      } else if (data.error) {
        clearTimeout(pollingTimeout);
        stopPolling();
        appendAiMessage("⚠️ Error: " + data.error);
        isSpeaking = false;
      }
    })
    .catch(error => console.error("Polling error:", error));
  }, POLLING_INTERVAL);

  fetch('https://issambel.app.n8n.cloud/webhook/7d681245-f864-4cd1-bfba-9de30f588592', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text })
  })
  .catch(error => {
    console.error("Error starting workflow:", error);
    clearTimeout(pollingTimeout);
    stopPolling();
    appendAiMessage("⚠️ Error starting conversation");
    isSpeaking = false;
  });
}

function processAiResponse(reply) {
  const statusMessages = document.querySelectorAll('.status-message');
  if (statusMessages.length > 0) {
    statusMessages[statusMessages.length - 1].remove();
  }
  
  appendAiMessage(reply.toString().trim());
  speakText(reply, () => {
    isSpeaking = false;
    startRecognition();
  });
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

function startRecognition() {
  if (!recognition) return;
  finalTranscript = '';
  recognition.start();
  startBtn.disabled = true;
  stopBtn.disabled = false;
}

function speakText(text, onEndCallback) {
  if ('speechSynthesis' in window && text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.onerror = (event) => {
      console.error('SpeechSynthesis error:', event);
      if (onEndCallback) onEndCallback();
    };
    utterance.onend = () => {
      if (onEndCallback) onEndCallback();
    };
    speechSynthesis.speak(utterance);
  } else {
    if (onEndCallback) onEndCallback();
  }
}
