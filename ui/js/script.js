// 📌 Глобальные переменные
let animationId = null;
let isMuted = true;
let awake = false;
let finalTranscript = "";
let interimTranscript = "";
let singleRequestMode = false;
let micOn   = false;          // истинный флаг – НЕ сам checkbox
let mediaRecorder, analyser, silenceTmr, audioChunks = [];

// 🎯 DOMContentLoaded – чтобы всё DOM было готово
window.addEventListener("DOMContentLoaded", () => {
    
    const toggleButton = document.getElementById("toggleButton");
    const micIcon = document.getElementById("micIcon");
    const messageText = document.getElementById("messageText");
    const chatInput     = document.getElementById("chatInput");

    // 🧠 Управление UI
    function startListener(text = "Слушаю", holdText = false) {
        micIcon.classList.remove('fa-microphone-lines-slash');
        micIcon.classList.add("mic-active");
        micIcon.classList.add('fa-microphone-lines');
    
        if (toggleButton.disabled) toggleButton.disabled = false;
    
        if (!holdText) {
            messageText.innerHTML = text || (awake ? "Слушаю..." : "что хотите?");
        }
    
    }
    function stopListener(text = "", holdText = false, temporary = false) {
        micIcon.classList.remove('fa-microphone-lines');
        micIcon.classList.remove('mic-active');
        micIcon.classList.add('fa-microphone-lines-slash');
    
       
    
        if (!holdText) {
            messageText.innerHTML = text || "Переключите микрофон и скажите";
        }
    
        
    }
    let recordingActive = false;
    
    // ✅ TTS — обычное Web‑Speech API
    function speakText(text){
        if(!text?.trim()) return;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "ru-RU";
        speechSynthesis.speak(u);
    }

    function muteAssistant () {
        isMuted = true;            // переключаем глобальный флаг
        stopListener();            // ставим иконку зачёркнутого микрофона, сбрасываем UI
        console.log("🔇 mute активен");
    }
    eel.expose(muteAssistant);
    

    function unmuteAssistant() {
        isMuted = false;
        startListener();
        console.log("🎤 mute отключён, слушаю");
    }
    eel.expose(unmuteAssistant);

    // 💬 Вывод сообщений
    const chatMessages = document.getElementById("chatMessages");
    function addMessageToChat(msg, sender="user"){
        const d = document.createElement("div");
        d.className = sender==="user" ? "user-message" : "assistant-message";
        d.textContent = msg;
        chatMessages.appendChild(d);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    
    

    

    
      
      

    async function checkMicrophone() {
        try {
            // Запрашиваем доступ к аудио-потоку
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Останавливаем треки, чтобы освободить устройство
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            console.error("Микрофон недоступен:", error);
            return false;
        }
    }





















    //////////////////////Управление распознаванием речи////////////////////////////
    function toggleMic(forceState = !micOn) {   // true = вкл
        micOn = forceState;
        toggleButton.checked = micOn;             // синхронизируем UI
        if (micOn) startRecording(); else stopRecording();
    }

    // Клавиша «ё/`»
    document.addEventListener("keydown", e => {
        if (e.key === '`' || e.code === 'Backquote') toggleMic();
    });
    
    // Клик по слайдеру
    toggleButton.addEventListener("change", () => toggleMic(toggleButton.checked));  
    ////////////////Запуск / остановка записи////////////////////////////////
    async function startRecording() {
        if (mediaRecorder?.state === "recording") return;
        const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
        mediaRecorder = new MediaRecorder(stream, {mimeType:"audio/webm"});
        audioChunks.length = 0;
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop          = onRecordingStop;
        mediaRecorder.start();
          // анализ громкости для паузы
        const ctx  = new (window.AudioContext||window.webkitAudioContext)();
        analyser   = ctx.createAnalyser();
        const src  = ctx.createMediaStreamSource(stream);
        src.connect(analyser);
        detectSilence();

        startListener("Слушаю…", true);
    }

    function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording"){
        mediaRecorder.stop();          // ← вызовет onRecordingStop()
    }
    clearTimeout(silenceTmr);
    analyser?.disconnect();
    stopListener("Обрабатываю…", true);
    }
    ////////////////Детектор тишины (2 с)////////////////////////////////
    function detectSilence() {
        const buf = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((s,v)=>s+(v-128)**2,0)/buf.length);
      
        if (rms < 5) {                         // ~ 0,5 % амплитуды
            if (!silenceTmr) silenceTmr = setTimeout(stopRecording, 2000);
        } else {
            clearTimeout(silenceTmr); silenceTmr = null;
        }
        if (micOn) requestAnimationFrame(detectSilence);  // цикл пока микр. включён
    }
//////////////////Отправка на Whisper и далее в GPT/////////////////////////////////////
    async function onRecordingStop() {
        const blob = new Blob(audioChunks, { type:"audio/webm" });
        audioChunks.length = 0;                     // ✅ очищаем на всякий случай

        const arrBuf = await blob.arrayBuffer();
        const b64    = btoa(String.fromCharCode(...new Uint8Array(arrBuf)));

        const text   = await eel.transcribe_audio(b64)();
        if (!text.trim()) { toggleMic(false); return; }

        addMessageToChat(text,"user");
        const raw = await eel.process_input(text)();
        const resp = typeof raw === "string" ? JSON.parse(raw) : raw;

        addMessageToChat(resp.gptMessage,"assistant");
        if (!resp.gptMessage.includes("{name}")) speakText(resp.gptMessage);

        toggleMic(false);                                    // микрофон выкл.
    }


///////////////////////////////////Чат‑поле без «дублей»//////////////////////////////////////////
    chatInput.addEventListener("keydown", async e => {
        if (e.key !== "Enter" || !chatInput.value.trim()) return;
        const text = chatInput.value.trim(); chatInput.value="";
        addMessageToChat(text,"user");          // ← только здесь пишем
        const raw  = await eel.process_input(text)();
        const resp = typeof raw === "string" ? JSON.parse(raw) : raw;
        addMessageToChat(resp.gptMessage,"assistant");
        if (!resp.gptMessage.includes("{name}")) speakText(resp.gptMessage);
      });


































/////////////////ДЗАЙН И АНИМАЦИЯ И КОЕ-ЧТО ПЕРЕМЕШАННОЕ//////////////////////////
    // * Canvas configuration
    const canvas = document.getElementById('animationCanvas');
    const ctx = canvas.getContext('2d');

    // * Setting the intial size and color of the circle animation
    const initialRadius = 50;

    const initialColor = "rgb(194, 189, 255)";
    const listeningColor = "rgb(134, 225, 255)";

    let listening = false;
    let audioPlaying = false;

    initializeCircle(initialColor, initialRadius);

    function initializeCircle(initialColor, initialRadius) {
        /**
         * * This creates the circle that is the focus of the animation.
         * * It then starts the idle animation (pulsate)
         */
        // Draw the initial glowing ball
        ctx.beginPath();
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const gradient = ctx.createRadialGradient(centerX, centerY, initialRadius / 2, centerX, centerY, initialRadius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)')
        gradient.addColorStop(1, initialColor);
        ctx.fillStyle = gradient;
        ctx.arc(centerX, centerY, initialRadius, 0, Math.PI * 2);
        ctx.fill();

        pulsateAnimation()
    }

    // * Pulsating animation
    function pulsateAnimation() {
        /**
         * * This animation occurs whenever the audio is not playing.
         */

        if (!audioPlaying) {
            // Calculate the pulsation radius based on a sine wave
            const baseRadius = 50; // Initial radius
            const pulsationAmplitude = 2.5; // Amplitude of the pulsation
            const pulsationFrequency = 1.25; // Frequency of the pulsation (in Hz)

            const pulsationPhase = Date.now() * 0.001 * pulsationFrequency; // Phase based on time
            const pulsatingRadius = baseRadius + pulsationAmplitude * Math.sin(pulsationPhase);

            
            // Clear the canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw the pulsating ball
            ctx.beginPath();
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const gradient = ctx.createRadialGradient(centerX, centerY, pulsatingRadius / 2, centerX, centerY, pulsatingRadius);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
            gradient.addColorStop(1, awake ? listeningColor : initialColor); // Use the same initial color
            ctx.fillStyle = gradient;
            ctx.arc(centerX, centerY, pulsatingRadius, 0, Math.PI * 2);
            ctx.fill();

            // Call the function recursively for the pulsating effect

            requestAnimationFrame(() => pulsateAnimation());
        }
    }
    function animate(analyser, dataArray, prevRadius = null) {

        if (audioPlaying) {
            analyser.getByteFrequencyData(dataArray);
        
            // * Calculate the average frequency
            const averageFrequency = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        
            // * Calculate the ball radius based on the average frequency (with a larger range)
            const minRadius = 50;
            const maxRadius = 125;
            const radius = minRadius + (maxRadius - minRadius) * (averageFrequency / 255);
    
            // * Inside the animate function
            const blueRGB = [134, 225, 255]; // RGB values for pink hue
            const purpleRGB = [255, 190, 242]; // RGB values for purple hue
    
            // * Calculate the RGB values based on audio frequency using pink and purple hues
            const red = Math.round(blueRGB[0] + (purpleRGB[0] - blueRGB[0]) * (averageFrequency / 255));
            const green = Math.round(blueRGB[1] + (purpleRGB[1] - blueRGB[1]) * (averageFrequency / 255));
            const blue = Math.round(blueRGB[2] + (purpleRGB[2] - blueRGB[2]) * (averageFrequency / 255));
    
            // Create the RGB color string
            const color = `rgb(${red}, ${green}, ${blue})`;
        
            // Clear the canvas with a transparent background
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        
            // Draw the glowing ball
            ctx.beginPath();
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const gradient = ctx.createRadialGradient(centerX, centerY, radius / 2, centerX, centerY, radius);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
            gradient.addColorStop(1, color);
            ctx.fillStyle = gradient;
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fill();
        
            // Call the animate function recursively
            const prevRadius = radius
            requestAnimationFrame(() => animate(analyser, dataArray, prevRadius));
        }
    
        else {
    
            pulsateAnimation()
    
        }
    }
    function startCanvasAnimation() {
        if (animationId) cancelAnimationFrame(animationId);
        animationId = requestAnimationFrame(() => pulsateAnimation());
    }
    
    function stopCanvasAnimation() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

























       
  

});