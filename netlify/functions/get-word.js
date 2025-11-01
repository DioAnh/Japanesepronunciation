import 'dotenv/config';
import { GoogleGenAI } from "@google/genai";

const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const topics = ["Thức ăn", "Gia đình", "Thời tiết", "Trường học", "Màu sắc", "Động vật", "Chào hỏi hàng ngày", "Phương tiện đi lại", "Cơ thể người", "Đồ vật trong nhà"];
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];

    const prompt = `Bạn là giáo viên tiếng Nhật. Hãy cung cấp một danh sách gồm 5 từ vựng tiếng Nhật đơn giản, hàng ngày cho người Việt mới bắt đầu, liên quan đến chủ đề: "${randomTopic}". Mỗi từ phải bao gồm Hiragana (hoặc Katakana), Romaji, chữ Kanji (nếu có, nếu không thì trả về null), và nghĩa tiếng Việt. Chỉ trả lời bằng một mảng JSON (JSON array) theo định dạng sau: [{"word": "...", "romaji": "...", "kanji": ..., "meaning": "..."}, ...]`;

    const modelName = 'gemini-2.0-flash-lite';
    const result = await genAI.models.generateContent({
      model: modelName,
      generationConfig: { temperature: 0.8 },
      contents: [{ parts: [{ text: prompt }] }]
    });

    const rawText = result.text;
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) { throw new Error("Gemini did not return a valid JSON array: " + rawText); }

    const wordsArray = JSON.parse(jsonMatch[0]);
    const randomWord = wordsArray[Math.floor(Math.random() * wordsArray.length)];

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(randomWord)
    };
  } catch (error) {
    console.error("Error in get-word function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not fetch a new word.' })
    };
  }
};