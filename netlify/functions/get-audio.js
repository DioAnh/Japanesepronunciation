require('dotenv').config();
// ... (toàn bộ phần còn lại của file này giữ nguyên vì nó không dùng import) ...
// Dưới đây là toàn bộ file để bạn tiện copy
function createWavFile(pcmData) {
  const numChannels = 1, sampleRate = 24000, bitsPerSample = 16;
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmData.length;
  const fileSize = 36 + dataSize;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(fileSize, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22); buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28); buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34); buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmData.copy(buffer, 44);
  return buffer;
}
const callTtsApi = async (romaji, voiceName) => {
  const ttsModel = "gemini-2.5-pro-preview-tts";
  const payload = { contents: [{ parts: [{ text: romaji }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } } };
  const apiKey = process.env.GEMINI_API_KEY;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${ttsModel}:generateContent?key=${apiKey}`;
  const ttsResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!ttsResponse.ok) { const errorBody = await ttsResponse.text(); console.error(`TTS API Fail (Voice: ${voiceName}):`, errorBody); throw new Error(`TTS API call failed`); }
  const result = await ttsResponse.json();
  const audioData = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (audioData) {
    const pcmDataBuffer = Buffer.from(audioData, 'base64');
    const wavBuffer = createWavFile(pcmDataBuffer);
    return { audioData: wavBuffer.toString('base64'), mimeType: 'audio/wav' };
  } else { throw new Error('TTS returned invalid data.'); }
};
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') { return { statusCode: 405, body: 'Method Not Allowed' }; }
  try {
    const { romaji } = JSON.parse(event.body);
    if (!romaji) return { statusCode: 400, body: JSON.stringify({ error: 'No romaji text provided.' }) };
    const primaryVoice = "Charon";
    const fallbackVoices = ["Kore", "Leda", "Zephyr", "Puck", "Orus"];
    let audioResult = null, lastError = null;
    try {
      audioResult = await callTtsApi(romaji, primaryVoice);
    } catch (e) {
      console.warn(`Primary voice failed, trying fallbacks...`);
      for (const voice of fallbackVoices) {
        try {
          audioResult = await callTtsApi(romaji, voice);
          if (audioResult) { console.log(`TTS success with fallback: ${voice}`); break; }
        } catch (fallbackError) { lastError = fallbackError; }
      }
    }
    if (audioResult) { return { statusCode: 200, body: JSON.stringify(audioResult) }; }
    else { console.error("All TTS attempts failed:", lastError?.message); return { statusCode: 500, body: JSON.stringify({ error: 'Failed to generate audio.' }) }; }
  } catch (error) {
    console.error("Error in get-audio function:", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error.' }) };
  }
};