import 'dotenv/config';

// Helper function to create a WAV file from raw PCM data
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

// Helper function to call the TTS API
const callTtsApi = async (romaji, voiceName) => {
  const ttsModel = "gemini-2.5-pro-preview-tts";
  const payload = { contents: [{ parts: [{ text: romaji }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } } };
  const apiKey = process.env.GEMINI_API_KEY;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${ttsModel}:generateContent?key=${apiKey}`;
  const ttsResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  
  if (!ttsResponse.ok) throw new Error(`TTS API failed with status: ${ttsResponse.status}`);
  
  const result = await ttsResponse.json();
  const audioData = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

  if (audioData) {
    const pcmDataBuffer = Buffer.from(audioData, 'base64');
    const wavBuffer = createWavFile(pcmDataBuffer);
    return { audioData: wavBuffer.toString('base64'), mimeType: 'audio/wav' };
  } else {
    throw new Error('TTS returned invalid data.');
  }
};

// Main function handler
exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { romaji } = JSON.parse(event.body);
    if (!romaji) return { statusCode: 400, body: JSON.stringify({ error: 'No romaji text provided.' }) };
    
    // Using a stable voice as primary
    const primaryVoice = "Charon"; 
    const fallbackVoices = ["Kore", "Leda", "Zephyr", "Puck", "Orus"];
    let audioResult = null;

    try {
      audioResult = await callTtsApi(romaji, primaryVoice);
    } catch (e) {
      console.warn(`Primary voice failed, trying fallbacks...`);
      for (const voice of fallbackVoices) {
        try {
          audioResult = await callTtsApi(romaji, voice);
          if (audioResult) break;
        } catch (fallbackError) { /* continue */ }
      }
    }

    if (audioResult) {
      return { statusCode: 200, body: JSON.stringify(audioResult) };
    } else {
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to generate audio after all retries.' }) };
    }

  } catch (error) {
    console.error("Error in get-audio function:", error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error.' }) };
  }
};