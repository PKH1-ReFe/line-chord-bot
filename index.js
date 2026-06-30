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
// 1. 数字から音名に変換する配列（シャープを +、フラットを - に統一）
// ※ 12マスの音（0〜11）に綺麗に対応するように並び替えています
const NUM_TO_NOTE = [
  'C',       // 0
  'C+',      // 1 (C# / D-)
  'D',       // 2
  'D+',      // 3 (D# / E-)
  'E',       // 4
  'F',       // 5
  'F+',      // 6 (F# / G-)
  'G',       // 7
  'G+',      // 8 (G# / A-)
  'A',       // 9
  'A+',      // 10 (A# / B-)
  'B'        // 11
];

// 2. コードの仕組み（度数）を判定する辞書
const CHORD_DICTIONARY = { 
  '4,7': '',        // メジャーコード（例: C）
  '3,7': 'm',       // マイナーコード（例: Cm）
  '4,7,11': 'M7',   // メジャーセブンス（例: CM7）
  '4,7,10': '7',    // セブンス（例: C7）
  '3,7,10': 'm7'    // マイナーセブンス（例: Cm7）
};
// 【新しく追加】コード名から数字の並びを引っ張るための辞書
const REVERSE_CHORD_DICTIONARY = {
  '': [0, 4, 7],       // メジャー（例: C の場合は ルート音 + 4つ上 + 7つ上）
  'M': [0, 4, 7],      // CM と打たれたとき用
  'm': [0, 3, 7],      // マイナー
  'M7': [0, 4, 7, 11], // メジャーセブンス
  '7': [0, 4, 7, 10],  // セブンス
  'm7': [0, 3, 7, 10]  // マイナーセブンス
};

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

  const rawMessage = event.message.text.trim();

  // ① もし入力にスペースが含まれていたら、今まで通りの「音 ⇒ コード判定」
  if (rawMessage.includes(' ')) {
    // === ここには今までの「音からコードを当てる処理」をそのまま入れます ===
    // (最後のリプライで判定結果を返す)
    return;
  } 
  
  // ② スペースがない場合は「コード名 ⇒ 音の割り出し（逆引き）」とみなす！
  else {
    // 1文字目（ルート音）と、2文字目以降（mや7などのコードタイプ）に分ける
    // 例: "Cm7" なら root = "C", type = "m7" / "C+" なら root = "C+", type = ""
    let root = '';
    let type = '';

    if (rawMessage.length > 1 && (rawMessage[1] === '+' || rawMessage[1] === '-')) {
      root = rawMessage.substring(0, 2); // C+ や D- などの場合
      type = rawMessage.substring(2);
    } else {
      root = rawMessage.substring(0, 1); // C や D などの場合
      type = rawMessage.substring(1);
    }

    // ルート音を数字に変換
    const rootNum = NOTE_TO_NUM[root.toUpperCase()]; // 大文字小文字対策
    // 逆引き辞書からコードの仕組み（度数）を取得
    const intervals = REVERSE_CHORD_DICTIONARY[type];

    // 辞書に存在すれば、音名を計算して並べる
    if (rootNum !== undefined && intervals) {
      const resultNotes = intervals.map(interval => {
        // ルートの数字に度数を足して、12を超えたらループさせる処理
        const noteNum = (rootNum + interval) % 12;
        return NUM_TO_NOTE[noteNum];
      });

      // 結果を「C E G」のような文字列にする
      const replyText = `【構成音】\n${rawMessage} の構成音は: ${resultNotes.join(' ')}`;
      
      // LINEに返信する処理（お使いのLINE返信コードをここに）
      await client.replyMessage(event.replyToken, { type: 'text', text: replyText });
    } else {
      // コード名が見つからなかった場合
      await client.replyMessage(event.replyToken, { type: 'text', text: '対応するコードが見つかりませんでした' });
    }
  }
}

const PORT = 8080;
app.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました！`);
});