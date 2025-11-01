// --- Lấy các phần tử HTML ---
const wordDisplay = document.getElementById('word-display') as HTMLHeadingElement;
const romajiDisplay = document.getElementById('romaji-display') as HTMLParagraphElement;
const meaningDisplay = document.getElementById('meaning-display') as HTMLParagraphElement;
const scoreDisplay = document.getElementById('score-display') as HTMLSpanElement;
const tipDisplay = document.getElementById('tip-display') as HTMLParagraphElement;
const tipContainer = document.getElementById('tip-container') as HTMLDivElement;
const statusDisplay = document.getElementById('status-display') as HTMLParagraphElement;
const recordButton = document.getElementById('record-button') as HTMLButtonElement;
const listenButton = document.getElementById('listen-button') as HTMLButtonElement;
const nextButton = document.getElementById('next-button') as HTMLButtonElement;
// *** MỚI: Lấy thẻ audio player ***
const audioPlayer = document.getElementById('audio-player') as HTMLAudioElement;


// --- URL Backend ---
const API_URL = '/api';

// --- Trạng thái ứng dụng ---
let currentWord = '';
let currentRomaji = '';
let currentKanji: string | null = null;
let currentScore = 0;
let isRecording = false;
// *** MỚI: Cờ để kiểm tra xem audio đã được "mở khóa" chưa ***
let isAudioUnlocked = false;


// --- API Nhận diện giọng nói của Trình duyệt ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition: any;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'ja-JP';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event: any) => {
    const recognizedText = event.results[0][0].transcript;
    checkAnswer(recognizedText);
  };

  recognition.onend = () => {
    stopRecordingUI();
  };

  recognition.onerror = (event: any) => {
    console.error('Lỗi nhận diện giọng nói:', event.error);
    statusDisplay.textContent = 'Lỗi: Không thể nhận diện giọng nói.';
    stopRecordingUI();
  };
} else {
  recordButton.style.display = 'none';
  statusDisplay.textContent = 'Trình duyệt của bạn không hỗ trợ nhận diện giọng nói.';
}

// --- Hàm xử lý chính ---

// *** MỚI: Hàm này sẽ được gọi MỘT LẦN DUY NHẤT ***
function unlockAudio() {
    if (isAudioUnlocked) return;
    // Phát một đoạn âm thanh im lặng để "đánh thức" trình duyệt
    audioPlayer.play().catch(() => {});
    isAudioUnlocked = true;
    console.log("🔊 Audio context đã được mở khóa!");
    // Gỡ bỏ các trình nghe sự kiện sau khi đã chạy xong
    document.removeEventListener('click', unlockAudio);
    document.removeEventListener('keydown', unlockAudio);
}

async function getNewWord() {
  try {
    statusDisplay.textContent = '...';
    tipContainer.style.display = 'none';
    listenButton.disabled = true;
    recordButton.disabled = true;
    nextButton.style.display = 'none';

    const response = await fetch(`${API_URL}/get-word`, { method: 'POST' });
    if (!response.ok) {
      throw new Error('Không thể lấy từ vựng từ máy chủ.');
    }
    const data = await response.json();

    currentWord = data.word;
    currentRomaji = data.romaji;
    currentKanji = data.kanji;

    wordDisplay.textContent = currentWord;
    romajiDisplay.textContent = currentRomaji;
    meaningDisplay.textContent = data.meaning;

    listenButton.disabled = false;
    recordButton.disabled = false;
  } catch (error) {
    console.error(error);
    wordDisplay.textContent = 'Lỗi';
    romajiDisplay.textContent = 'Không thể tải từ vựng. Hãy thử tải lại trang.';
  }
}

// *** CẬP NHẬT: Hàm playAudio được đơn giản hóa ***
async function playAudio() {
  if (!currentRomaji) return;

  listenButton.disabled = true;
  listenButton.innerHTML = 'Đang tải...';

  try {
    const response = await fetch(`${API_URL}/get-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ romaji: currentRomaji })
    });

    console.log('[FRONTEND] Phản hồi từ server:', response);

    if (!response.ok) {
      throw new Error(`Lỗi khi lấy file âm thanh từ máy chủ. Status: ${response.status}`);
    }

    const { audioData, mimeType } = await response.json();

    // *** LOG CHI TIẾT ĐỂ DEBUG ***
    console.log(`[FRONTEND] Đã nhận được mimeType: ${mimeType}`);
    console.log(`[FRONTEND] Độ dài dữ liệu audioData: ${audioData ? audioData.length : 'undefined'}`);
    
    if (!audioData || audioData.length < 100) { // Dữ liệu audio hợp lệ thường rất dài
        console.error("[FRONTEND] LỖI: Dữ liệu audio nhận được quá ngắn hoặc bị rỗng!");
        statusDisplay.textContent = 'Lỗi: Dữ liệu âm thanh nhận được không hợp lệ.';
        // Dừng lại ở đây
        return; 
    }
    
    // Gán dữ liệu cho thẻ audio và phát
    const audioSrc = `data:${mimeType};base64,${audioData}`;
    console.log('[FRONTEND] Đã tạo Audio Source:', audioSrc.substring(0, 100) + '...'); // Chỉ log 100 ký tự đầu
    
    audioPlayer.src = audioSrc;
    audioPlayer.play().catch(e => {
        console.error("[FRONTEND] Lỗi khi audioPlayer.play():", e);
        statusDisplay.textContent = 'Lỗi: Không thể phát tệp âm thanh.';
    });

  } catch (error) {
    console.error('[FRONTEND] Lỗi trong khối try...catch:', error);
    statusDisplay.textContent = 'Lỗi: Không thể phát âm thanh mẫu.';
  } finally {
    listenButton.disabled = false;
    listenButton.innerHTML = 'Nghe 🔊';
  }
}

function checkAnswer(recognizedText: string) {
  const normalizedText = recognizedText.toLowerCase().trim();
  const correctRomaji = currentRomaji.toLowerCase().trim();

  const isCorrect = (
    normalizedText === correctRomaji ||
    normalizedText === currentWord ||
    (currentKanji && normalizedText === currentKanji)
  );

  if (isCorrect) {
    currentScore++;
    scoreDisplay.textContent = currentScore.toString();
    statusDisplay.textContent = 'Đúng rồi! Tuyệt vời!';
    statusDisplay.style.color = '#28a745';
    tipContainer.style.display = 'none';
    nextButton.style.display = 'inline-block';
  } else {
    statusDisplay.textContent = `Sai! Bạn nói: "${recognizedText}"`;
    statusDisplay.style.color = '#dc3545';
    getPronunciationTip(correctRomaji, recognizedText);
    nextButton.style.display = 'none';
  }
}

async function getPronunciationTip(correct: string, recognized: string) {
  try {
    tipContainer.style.display = 'block';
    tipDisplay.textContent = 'Đang lấy lời khuyên...';
    const response = await fetch(`${API_URL}/get-tip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correctRomaji: correct, recognizedText: recognized })
    });
    if (!response.ok) throw new Error('Không thể lấy lời khuyên.');
    const { tip } = await response.json();
    tipDisplay.textContent = tip;
  } catch (error) {
    console.error(error);
    tipDisplay.textContent = 'Không thể tải lời khuyên. Hãy thử lại.';
  }
}

function toggleRecording() {
  if (!recognition) return;
  if (isRecording) {
    recognition.stop();
  } else {
    try {
      recognition.start();
      startRecordingUI();
    } catch (error) {
      console.error("Lỗi khi bắt đầu ghi âm:", error);
      statusDisplay.textContent = 'Không thể bắt đầu ghi âm. Hãy thử lại.';
    }
  }
}

function startRecordingUI() {
  isRecording = true;
  recordButton.textContent = 'Đang nghe... 🎤';
  recordButton.classList.add('recording');
  statusDisplay.textContent = 'Hãy nói vào micro...';
  statusDisplay.style.color = '#007bff';
}

function stopRecordingUI() {
  isRecording = false;
  recordButton.textContent = 'Ghi âm 🎙️';
  recordButton.classList.remove('recording');
}

// --- Gán sự kiện cho các nút ---
recordButton.addEventListener('click', toggleRecording);
listenButton.addEventListener('click', playAudio);
nextButton.addEventListener('click', getNewWord);
// *** MỚI: Gán sự kiện để mở khóa audio ***
document.addEventListener('click', unlockAudio);
document.addEventListener('keydown', unlockAudio);


// --- Khởi động ứng dụng ---
getNewWord();