import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import { GoogleGenAI } from "@google/genai";

// --- Cài đặt ---
const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

// *** HÀM MỚI: Tạo file WAV từ dữ liệu PCM thô ***
function createWavFile(pcmData) {
  const numChannels = 1;
  const sampleRate = 24000;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const fileSize = 36 + dataSize;

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // sub-chunk size
  buffer.writeUInt16LE(1, 20); // audio format (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Ghi dữ liệu PCM vào buffer
  pcmData.copy(buffer, 44);

  return buffer;
}


// --- CẬP NHẬT HÀM GỌI TTS ---
const callTtsApi = async (romaji, voiceName) => {
    const ttsModel = "gemini-2.5-flash-preview-tts";
    const payload = {
        contents: [{
            parts: [{ text: romaji }]
        }],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voiceName }
                }
            }
        }
    };

    const apiKey = process.env.GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${ttsModel}:generateContent?key=${apiKey}`;

    const ttsResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!ttsResponse.ok) {
        let errorBody;
        try {
            errorBody = await ttsResponse.json();
        } catch {
            errorBody = await ttsResponse.text();
        }
        console.error(`[BACKEND] TTS API (Giọng ${voiceName}) Thất Bại:`, errorBody);
        throw new Error(`TTS API call failed with status: ${ttsResponse.status}. Details: ${JSON.stringify(errorBody)}`);
    }

    const result = await ttsResponse.json();
    console.log('[BACKEND] Đã nhận phản hồi từ Gemini TTS API.');

    const part = result?.candidates?.[0]?.content?.parts?.[0];
    const audioData = part?.inlineData?.data;

    if (audioData) {
        // *** THAY ĐỔI QUAN TRỌNG ***
        // 1. Giải mã Base64 của PCM thành Buffer
        const pcmDataBuffer = Buffer.from(audioData, 'base64');
        
        // 2. Tạo Buffer của file WAV hoàn chỉnh
        const wavBuffer = createWavFile(pcmDataBuffer);
        
        // 3. Mã hóa lại file WAV thành Base64 để gửi đi
        const wavBase64 = wavBuffer.toString('base64');

        // 4. Trả về dữ liệu WAV và mimeType là audio/wav
        return { audioData: wavBase64, mimeType: 'audio/wav' };
    } else {
        console.error("[BACKEND] LỖI: Không tìm thấy 'inlineData.data' trong phản hồi.");
        throw new Error(`TTS trả về dữ liệu không hợp lệ. Finish Reason: ${result?.candidates?.[0]?.finishReason}`);
    }
};

// --- Nhiệm vụ 1: Lấy từ vựng mới (Không thay đổi) ---
app.post('/api/get-word', async (req, res) => {
 try {
   const topics = [
     "Chào hỏi hàng ngày"
   ];
   const randomTopic = topics[Math.floor(Math.random() * topics.length)];

   // *** THAY ĐỔI PROMPT ĐỂ YÊU CẦU MỘT DANH SÁCH ***
   const prompt = `Bạn là giáo viên tiếng Nhật. Hãy cung cấp một danh sách gồm 5 từ vựng tiếng Nhật đơn giản, hàng ngày cho người Việt mới bắt đầu, liên quan đến chủ đề: "${randomTopic}".
     Mỗi từ phải bao gồm Hiragana (hoặc Katakana), Romaji, chữ Kanji (nếu có, nếu không thì trả về null), và nghĩa tiếng Việt.
     Chỉ trả lời bằng một mảng JSON (JSON array) theo định dạng sau:
     [
        {"word": "...", "romaji": "...", "kanji": ..., "meaning": "..."},
        {"word": "...", "romaji": "...", "kanji": ..., "meaning": "..."},
        {"word": "...", "romaji": "...", "kanji": ..., "meaning": "..."}
     ]
   `;

   const modelName = 'gemini-2.0-flash-lite';
   
   const result = await genAI.models.generateContent({
     model: modelName,
     // *** THÊM "temperature" ĐỂ TĂNG TÍNH SÁNG TẠO CHO AI ***
     generationConfig: {
        temperature: 0.8, 
     },
     contents: [{ parts: [{ text: prompt }] }]
   });
   
   const rawText = result.text;
   
   // Thay đổi regex để tìm một mảng JSON `[...]`
   const jsonMatch = rawText.match(/\[[\s\S]*\]/); 
   if (!jsonMatch) {
     throw new Error("Gemini không trả về một mảng JSON hợp lệ: " + rawText);
   }
   
   // *** CHỌN NGẪU NHIÊN MỘT TỪ TỪ DANH SÁCH ***
   const wordsArray = JSON.parse(jsonMatch[0]);
   const randomWord = wordsArray[Math.floor(Math.random() * wordsArray.length)];
   
   // Gửi từ ngẫu nhiên đó về cho frontend
   res.json(randomWord);

 } catch (error) {
   console.error("Lỗi /api/get-word:", error);
   res.status(500).json({ error: 'Không thể lấy từ vựng mới.' });
 }
});


// --- Nhiệm vụ 2: Tạo âm thanh (Text-to-Speech) (Không thay đổi) ---
app.post('/api/get-audio', async (req, res) => {
 try {
   const { romaji } = req.body;
   if (!romaji) {
     return res.status(400).json({ error: 'Không có văn bản romaji để đọc.' });
   }

   const primaryVoice = "Leda";
   const fallbackVoices = ["Charon", "Kore", "Zephyr", "Puck", "Orus"];

   let audioData = null;
   let mimeType = null;
   let lastError = null;

   try {
       const result = await callTtsApi(romaji, primaryVoice);
       audioData = result.audioData;
       mimeType = result.mimeType;
   } catch (e) {
       lastError = e;
       console.warn(`Lỗi khi gọi giọng chính, thử lại với giọng dự phòng.`);
   }

   if (!audioData) {
       for (const voice of fallbackVoices) {
           try {
               const result = await callTtsApi(romaji, voice);
               audioData = result.audioData;
               mimeType = result.mimeType;
               console.log(`TTS thành công với giọng dự phòng: ${voice}`);
               break;
           } catch (e) {
               lastError = e;
               continue;
           }
       }
   }

   if (audioData && mimeType) {
     res.json({ audioData, mimeType });
   } else {
     console.error("Tất cả các lần thử TTS đều thất bại:", lastError?.message || "Lỗi không xác định");
     res.status(500).json({ error: 'Không thể tạo âm thanh sau nhiều lần thử.' });
   }

 } catch (error) {
   console.error("Lỗi /api/get-audio (Tổng quát):", error.message);
   res.status(500).json({ error: 'Không thể tạo âm thanh.' });
 }
});


// --- Nhiệm vụ 3: Đưa ra lời khuyên (Không thay đổi) ---
app.post('/api/get-tip', async (req, res) => {
 try {
   const { correctRomaji, recognizedText } = req.body;
   const prompt = `
     Một người Việt đang học tiếng Nhật.
     Từ đúng (romaji) là: "${correctRomaji}"
     Nhưng họ phát âm và máy nhận diện thành: "${recognizedText}"
     Hãy đưa ra MỘT lời khuyên ngắn gọn, đơn giản (khoảng 1-2 câu) bằng TIẾNG VIỆT để giúp họ sửa lỗi.
     Nếu văn bản nhận diện là chữ Kanji (ví dụ: "犬") và từ đúng là Hiragana ("いぬ"), hãy giải thích rằng họ đã đọc đúng, nhưng máy nhận diện thành chữ Kanji.
     Ví dụ: "Bạn đọc đúng rồi! "犬" là chữ Kanji của "inu". Tốt lắm!"
   `;

   const modelName = 'gemini-2.0-flash-lite';

   const result = await genAI.models.generateContent({
     model: modelName,
     contents: [{ parts: [{ text: prompt }] }]
   });

   const rawText = result.text;

   res.json({ tip: rawText });

 } catch (error) {
   console.error("Lỗi /api/get-tip:", error);
   res.status(500).json({ error: 'Không thể đưa ra lời khuyên.' });
 }
});

// --- Khởi động máy chủ ---
const port = 3000;
app.listen(port, () => {
  console.log(`✅ Máy chủ Luyện Phát Âm đang chạy tại http://localhost:${port}`);
});