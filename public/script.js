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
    appendStatusMessage("Listening...", 'status');
    finalTranscript = '';
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    // Reset final transcript on new speech segment
    if (event.resultIndex === 0) {
      finalTranscript = '';
    }
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript = transcript;
      }
    }
    
    updateUserBubble(finalTranscript || interimTranscript, !!finalTranscript);
    
    clearTimeout(silenceTimeout);
    silenceTimeout = setTimeout(() => {
      recognition.stop();
    }, 1000);
  };

  recognition.onerror = (event) => {
    console.error("Speech Recognition Error:", event.error);
    appendStatusMessage("Error: " + event.error, 'error');
    stopPolling();
  };

  recognition.onend = () => {
    startBtn.disabled = false;
    stopBtn.disabled = true;

    if (finalTranscript.trim() !== '') {
      sendToN8N(finalTranscript.trim());
    } else {
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
  });
}

function clearChat() {
  output.innerHTML = '';
}

function appendStatusMessage(msg, type = 'info') {
  // Remove previous status messages of same type
  const existing = output.querySelector(`.status-message.${type}`);
  if (existing) {
    output.removeChild(existing);
  }
  
  const div = document.createElement('div');
  div.className = `status-message ${type}`;
  div.textContent = msg;
  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
}

function updateUserBubble(text, isFinal) {
  const lastUserBubble = output.querySelector('.chat-bubble.user:last-child');
  
  // Remove previous bubble if it wasn't final
  if (lastUserBubble && !lastUserBubble.classList.contains('final')) {
    output.removeChild(lastUserBubble);
  }
  
  // Only add new bubble if we have content and either:
  // - It's final, or
  // - There isn't already a final bubble
  if (text && (isFinal || !output.querySelector('.chat-bubble.user.final'))) {
    const div = document.createElement('div');
    div.className = `chat-bubble user ${isFinal ? 'final' : 'interim'}`;
    div.textContent = text;
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
  }
}

function appendAiMessage(text) {
  // Remove any "AI is thinking" status
  const thinkingStatus = output.querySelector('.status-message.status');
  if (thinkingStatus) {
    output.removeChild(thinkingStatus);
  }

  const div = document.createElement('div');
  div.className = 'chat-bubble ai';
  div.textContent = text;
  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
}

function sendToN8N(text) {
  isSpeaking = true;
  
  // Show thinking status before making the request
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

  fetch('https://issambel.app.n8n.cloud/webhook/3b6ad237-2fa7-49cb-a7c7-6741f9755a4e', {
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
  const aiReply = reply.toString().trim();
  appendAiMessage(aiReply);
  speakText(aiReply, () => {
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