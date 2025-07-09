// DOM Elements

const micButton = document.getElementById('micButton');
const transcriptBox = document.getElementById('transcriptBox');
const languageSelector = document.getElementById('languageSelector');



// Configuration
const DEEPGRAM_API_KEY = '9bc86cfa2b39dd48dff106e7150d3224823c900e'; // Replace with your key
const PHRASE_PAUSE_THRESHOLD = 1000; // 1 second pause detection
const MODEL_CONFIG = {
    'english': { model: 'nova-2', language: 'en', smart_format: true },
    'french': { model: 'nova-2', language: 'fr', smart_format: true }
};



// State Management
let deepgramClient;
let deepgramConnection;
let isRecording = false;
let mediaStream;
let audioContext;
let audioWorkletNode;

let phrases = [];
let currentPhrase = '';
let lastWordTime = 0;
let phraseTimer;
let streamStartTime = 0;

// Audio Worklet Processor
const workletProcessor = `
class AudioProcessor extends AudioWorkletProcessor {
    process(inputs) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const int16Buffer = new Int16Array(input[0].length);
            for (let i = 0; i < input[0].length; i++) {
                const s = Math.max(-1, Math.min(1, input[0][i]));
                int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            this.port.postMessage(int16Buffer.buffer);
        }
        return true;
    }
}
registerProcessor('audio-processor', AudioProcessor);
`;

// Initialize Deepgram
function initializeDeepgram() {
    if (!window.deepgram) {
        throw new Error('Deepgram SDK not loaded. Load the SDK before initializing.');
    }
    deepgramClient = deepgram.createClient(DEEPGRAM_API_KEY);
}

// Transcript Management
function updateTranscript() {
    let html = '';
    
    // Completed phrases
    phrases.forEach((phrase, index) => {
        html += `<div class="phrase">
            <span class="phrase-marker">${index + 1}.</span>
            <span class="phrase-text">${phrase}</span>
        </div>`;
    });
    
    // Current in-progress phrase
    if (currentPhrase) {
        html += `<div class="current-phrase">
            <span class="phrase-marker">${phrases.length + 1}.</span>
            <span class="phrase-text">${currentPhrase}</span>
        </div>`;
    }
    
    // Initial state
    if (!html) {
        html = `<div class="status">Ready to transcribe (${languageSelector.value.toUpperCase()})</div>`;
    }
    
    transcriptBox.innerHTML = html;
    transcriptBox.scrollTop = transcriptBox.scrollHeight;
}

function finalizeCurrentPhrase() {
    if (currentPhrase) {
        phrases.push(currentPhrase);
        
        // Dispatch event for webhook integration
        const event = new CustomEvent('phraseCompleted', {
            detail: {
                transcript: currentPhrase,
                language: languageSelector.value,
                timestamp: new Date().toISOString(),
                duration: Date.now() - streamStartTime
            }
        });
        document.dispatchEvent(event);
        
        currentPhrase = '';
        updateTranscript();
    }
}

function resetPhraseTimer() {
    clearTimeout(phraseTimer);
    phraseTimer = setTimeout(finalizeCurrentPhrase, PHRASE_PAUSE_THRESHOLD);
}

// Audio Handling
async function setupAudioStream() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
            },
            video: false
        });
        
        audioContext = new AudioContext({ sampleRate: 16000 });
        
        const blob = new Blob([workletProcessor], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        await audioContext.audioWorklet.addModule(workletUrl);
        
        const source = audioContext.createMediaStreamSource(mediaStream);
        audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
        
        source.connect(audioWorkletNode);
        audioWorkletNode.connect(audioContext.destination);
        
        audioWorkletNode.port.onmessage = (event) => {
            if (deepgramConnection?.getReadyState() === 1) {
                deepgramConnection.send(event.data);
            }
        };
    } catch (error) {
        console.error('Audio setup failed:', error);
        throw new Error('Microphone access denied or audio processing failed');
    }
}

// Deepgram Event Handlers
function setupDeepgramConnection() {
    const language = languageSelector.value;
    const config = MODEL_CONFIG[language];
    
    deepgramConnection = deepgramClient.listen.live({
        ...config,
        interim_results: true,
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1,
        endpointing: 300,
        punctuate: true,
        diarize: false,
        utterances: false
    });
    
    deepgramConnection.on(deepgram.LiveTranscriptionEvents.Open, () => {
        streamStartTime = Date.now();
        lastWordTime = streamStartTime;
        console.log('Deepgram connection opened');
    });
    
    deepgramConnection.on(deepgram.LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel.alternatives[0]?.transcript?.trim();
        const now = Date.now();
        
        if (transcript) {
            // Detect new phrase after pause
            if (now - lastWordTime > PHRASE_PAUSE_THRESHOLD && currentPhrase) {
                finalizeCurrentPhrase();
            }
            
            lastWordTime = now;
            
            // Update current phrase
            if (data.is_final) {
                currentPhrase += (currentPhrase ? ' ' : '') + transcript;
                resetPhraseTimer();
                updateTranscript();
            }
        }
    });
    
    deepgramConnection.on(deepgram.LiveTranscriptionEvents.Close, () => {
        finalizeCurrentPhrase();
        console.log('Deepgram connection closed');
    });
    
    deepgramConnection.on(deepgram.LiveTranscriptionEvents.Error, (error) => {
        console.error('Deepgram error:', error);
        transcriptBox.innerHTML = `<div class="error">Connection error - please refresh</div>`;
    });
}

// Recording Control
async function startRecording() {
    try {
        phrases = [];
        currentPhrase = '';
        updateTranscript();
        
        await setupAudioStream();
        setupDeepgramConnection();
        
        isRecording = true;
        micButton.classList.add('listening');
    } catch (error) {
        console.error('Recording start failed:', error);
        transcriptBox.innerHTML = `<div class="error">${error.message}</div>`;
        stopRecording();
    }
}

function stopRecording() {
    // Finalize any pending phrase
    finalizeCurrentPhrase();
    
    // Cleanup connections
    if (deepgramConnection) {
        deepgramConnection.finish();
    }
    
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
    }
    
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
    }
    
    clearTimeout(phraseTimer);
    isRecording = false;
    micButton.classList.remove('listening');
}

// Toggle Recording
async function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
}

// Initialize App
function initialize() {
    try {
        initializeDeepgram();
        micButton.addEventListener('click', toggleRecording);
        updateTranscript();
    } catch (error) {
        console.error('Initialization failed:', error);
        transcriptBox.innerHTML = `<div class="error">${error.message}</div>`;
    }
}

// Start the application when SDK is ready
if (window.deepgram) {
    initialize();
} else {
    window.addEventListener('deepgram-sdk-ready', initialize);
}