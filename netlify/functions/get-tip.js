import 'dotenv/config';
import { GoogleGenAI } from "@google/genai";

exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
    const { correctRomaji, recognizedText } = JSON.parse(event.body);

    const prompt = `Một người Việt đang học tiếng Nhật. Từ đúng (romaji) là: "${correctRomaji}". Nhưng họ phát âm và máy nhận diện thành: "${recognizedText}". Hãy đưa ra MỘT lời khuyên ngắn gọn, đơn giản (khoảng 1-2 câu) bằng TIẾNG VIỆT để giúp họ sửa lỗi. Nếu văn bản nhận diện là chữ Kanji (ví dụ: "犬") và từ đúng là Hiragana ("いぬ"), hãy giải thích rằng họ đã đọc đúng, nhưng máy nhận diện thành chữ Kanji. Ví dụ: "Bạn đọc đúng rồi! "犬" là chữ Kanji của "inu". Tốt lắm!"`;

    const modelName = 'gemini-2.0-flash-lite';
    const result = await genAI.models.generateContent({
      model: modelName,
      contents: [{ parts: [{ text: prompt }] }]
    });

    const rawText = result.text;
    return {
      statusCode: 200,
      body: JSON.stringify({ tip: rawText })
    };

  } catch (error) {
    console.error("Error in get-tip function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not fetch a tip.' })
    };
  }
};