let lastDisplayedText = null;  // to track last shown message

async function fetchAndDisplayAIResponse() {
  try {
    const response = await fetch('/get-ai-reply');
    const { text } = await response.json();

    if (text && text !== lastDisplayedText) {  // only append if new
      lastDisplayedText = text;

      const transcriptBox = document.getElementById('transcriptBox');

      const aiElement = document.createElement('div');
      aiElement.className = 'phrase ai-phrase';
      aiElement.innerHTML = `
        <span class="phrase-marker">AI.</span>
        <span class="phrase-text">${text}</span>
      `;

      transcriptBox.appendChild(aiElement);
      transcriptBox.scrollTop = transcriptBox.scrollHeight;

      console.log('AI response displayed:', text);
    }
  } catch (error) {
    console.error('Fetch error:', error);
  }
}

async function pollAIResponse(interval = 2000) {
  while (true) {
    await fetchAndDisplayAIResponse();
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

pollAIResponse();
