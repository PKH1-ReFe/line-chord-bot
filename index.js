const express = require('express');
const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const app = express();
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
});

const NOTE_TO_NUM = { 'C':0, 'C#':1, 'Db':1, 'D':2, 'D#':3, 'Eb':3, 'E':4, 'F':5, 'F#':6, 'Gb':6, 'G':7, 'G#':8, 'Ab':8, 'A':9, 'A#':10, 'Bb':10, 'B':11 };
const NUM_TO_NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHORD_DICTIONARY = { '4,7': '', '3,7': 'm', '4,7,11': 'M7', '4,7,10': '7', '3,7,10': 'm7' };

function detectChord(inputNotes) {
  let inputNums = [...new Set(inputNotes.map(note => NOTE_TO_NUM[note]).filter(n => n !== undefined))].sort((a, b) => a - b);
  if (inputNums.length < 2) return "音を2つ以上正しく入力してください（例: C E G）";

  for (let root of inputNums) {
    let intervals = inputNums.map(num => (num - root + 12) % 12).sort((a, b) => a - b);
    let key = intervals.slice(1).join(',');
    if (CHORD_DICTIONARY[key] !== undefined) {
      return `${NUM_TO_NOTE[root]}${CHORD_DICTIONARY[key]}`;
    }
  }
  return "対応するコードが見つかりませんでした";
}

// Webhookの受け口を確実に非同期対応にする
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    res.json(results);
  } catch (err) {
    console.error("【Webhook全体の致命的エラー】:", err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const userText = event.message.text.toUpperCase();
  
  // スペースがあってもなくても1文字ずつバラす魔法の処理
  const inputNotes = userText.includes(' ') || userText.includes(',') 
    ? userText.split(/[\s,]+/) 
    : userText.match(/[A-G](#|b)?/g) || [];

  const resultChord = detectChord(inputNotes);

  try {
    console.log(`【送信試行】 replyToken: ${event.replyToken} / メッセージ: ${resultChord}`);
    
    const response = await client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ 
        type: 'text', 
        text: `【判定結果】\n入力: ${inputNotes.join(', ')}\nコード: ${resultChord}` 
      }]
    });
    
    console.log("【送信成功！】LINEへの返信が完了しました。");
    return response;
  } catch (error) {
    // エラーの中身を極限まで分解して画面に出す
    console.error("【LINE送信エラー詳細】:");
    if (error.response && error.response.data) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error);
    }
  }
}

const PORT = 8080;
app.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました！`);
});