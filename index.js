const express = require('express');
const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const app = express();

// 【修正箇所】最新のLINE SDKに合わせたクライアントの作成方法
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
});

const NOTE_TO_NUM = { 
  'C': 0, 'B+': 0,
  'C+': 1, 'D-': 1,
  'D': 2, 
  'D+': 3, 'E-': 3, 
  'E': 4, 'F-': 4,
  'F': 5, 'E+': 5,
  'F+': 6, 'G-': 6, 
  'G': 7, 
  'G+': 8, 'A-': 8, 
  'A': 9, 
  'A+': 10, 'B-': 10, 
  'B': 11, 'C-': 11,
};

const NUM_TO_NOTE = [
  'C',       // 0
  'C+',      // 1
  'D',       // 2
  'D+',      // 3
  'E',       // 4
  'F',       // 5
  'F+',      // 6
  'G',       // 7
  'G+',      // 8
  'A',       // 9
  'A+',      // 10
  'B'        // 11
];

const CHORD_DICTIONARY = { 
  '4,7': '',        // メジャー
  '3,7': 'm',       // マイナー
  '4,7,11': 'M7',   // メジャーセブンス
  '4,7,10': '7',    // セブンス
  '3,7,10': 'm7'    // マイナーセブンス
};

const REVERSE_CHORD_DICTIONARY = {
  '': [0, 4, 7],       // メジャー
  'M': [0, 4, 7],      // M
  'm': [0, 3, 7],      // マイナー
  'M7': [0, 4, 7, 11], // メジャーセブンス
  '7': [0, 4, 7, 10],  // セブンス
  'm7': [0, 3, 7, 10]  // マイナーセブンス
};

// Webhookの受け口
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

  const rawMessage = event.message.text.trim();

  // ----------------------------------------------------
  // パターンA：入力にスペースがある場合【音 ⇒ コード名】
  // ----------------------------------------------------
  if (rawMessage.includes(' ')) {
    // 最初の1文字目を大文字、2文字目（+や-）があればそのまま結合
    const inputNotes = rawMessage.split(/\s+/).map(note => {
      if (!note) return '';
      return note.charAt(0).toUpperCase() + note.slice(1);
    }).filter(note => note !== '');

    const nums = inputNotes.map(note => NOTE_TO_NUM[note]).filter(num => num !== undefined);

    // 【修正箇所】client.replyMessage の引数の書き方を最新版に修正
    if (nums.length < 2) {
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '【判定結果】\n音を2つ以上正しく入力してください (例: C E G)' }]
      });
    }

    const rootNum = nums[0];
    // 転回形にも対応できるように、すべての音の差を計算してソート
    const intervals = nums.slice(1).map(num => (num - rootNum + 12) % 12).sort((a, b) => a - b);
    const intervalKey = intervals.join(',');
    const chordType = CHORD_DICTIONARY[intervalKey];

    let replyText = '';
    if (chordType !== undefined) {
      replyText = `【判定結果】\n入力: ${inputNotes.join(', ')}\nコード: ${NUM_TO_NOTE[rootNum]}${chordType}`;
    } else {
      replyText = `【判定結果】\n入力: ${inputNotes.join(', ')}\nコード: 対応するコードが見つかりませんでした`;
    }

    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: replyText }]
    });
  } 
  
  // ----------------------------------------------------
  // パターンB：入力にスペースがない場合【コード名 ⇒ 音（逆引き）】
  // ----------------------------------------------------
  else {
    let root = '';
    let type = '';

    if (rawMessage.length > 1 && (rawMessage[1] === '+' || rawMessage[1] === '-')) {
      root = rawMessage.substring(0, 2);
      type = rawMessage.substring(2);
    } else {
      root = rawMessage.substring(0, 1);
      type = rawMessage.substring(1);
    }

    const formattedRoot = root.charAt(0).toUpperCase() + root.slice(1);
    const rootNum = NOTE_TO_NUM[formattedRoot];
    const intervals = REVERSE_CHORD_DICTIONARY[type];

    if (rootNum !== undefined && intervals) {
      const resultNotes = intervals.map(interval => {
        const noteNum = (rootNum + interval) % 12;
        return NUM_TO_NOTE[noteNum];
      });

      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: `【構成音】\n${rawMessage} の構成音は:\n${resultNotes.join(' ')}` }]
      });
    } else {
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '対応するコードが見つかりませんでした' }]
      });
    }
  }
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました！`);
});