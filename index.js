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

// ♯（+）ベースの音名リスト（これは前からあったもの）
const SHARP_NOTES = ['C', 'C+', 'D', 'D+', 'E', 'F', 'F+', 'G', 'G+', 'A', 'A+', 'B'];

// ★ここを追加！ ♭（-）ベースの音名リスト
const FLAT_NOTES  = ['C', 'D-', 'D', 'E-', 'E', 'F', 'G-', 'G', 'A-', 'A', 'B-', 'B'];

const CHORD_DICTIONARY = { 
  '4,7': '',        // メジャー
  '3,7': 'm',       // マイナー
  '4,7,11': 'M7',   // メジャーセブンス
  '4,7,10': '7',    // セブンス
  '3,7,10': 'm7',   // マイナーセブンス
  
  // ★ここから下を追加！
  '5,7': 'sus4',       // サスフォー (例: C F G)
  '4,7,14': '9',       // ナインス (14マス上＝2周目のレ。ループ処理で '2,4,7' になる場合は '2,4,7': '9' も予備で入れると安全です)
  '2,4,7': '9',        // 1オクターブ内で収めて打たれたとき用の9
  '4,7,10,14': '9',    // ドミナントナインス（C9など / ループ考慮で '2,4,7,10': '9' も追加）
  '2,4,7,10': '9',
  '4,8': 'aug',        // オーグメント (例: C E G+)
  '3,6': 'dim',        // ディミニッシュ (例: C E- G-)
  '3,6,9': 'dim7',     // ディミニッシュセブンス (例: C E- G- A)
  '2,7': 'sus2'        // サスツー (例: C D G)
};

const REVERSE_CHORD_DICTIONARY = {
  '': [0, 4, 7],
  'M': [0, 4, 7],
  'm': [0, 3, 7],
  'M7': [0, 4, 7, 11],
  '7': [0, 4, 7, 10],
  'm7': [0, 3, 7, 10],
  
  'sus4': [0, 5, 7],
  'msus4': [0, 3, 5, 7],
  'Msus4': [0, 5, 7],
  '9': [0, 4, 7, 10, 14],
  
  // --- aug系 ---
  'aug': [0, 4, 8],
  'Maug': [0, 4, 8],     // CMaug などで送られたとき用
  'maug': [0, 3, 8],     // マイナー・オーグメント（ルート、短3度、増5度）

  // --- dim系 ---
  'dim': [0, 3, 6],
  'mdim': [0, 3, 6],  // Cmdim と m を重ねて打たれたとき用
  'Mdim': [0, 3, 6],    
  'dim7': [0, 3, 6, 9],
  'mdim7': [0, 3, 6, 9],  // Cmdim7 用
  'Mdim7': [0, 3, 6, 9], 

  // --- sus2系 ---
  'sus2': [0, 2, 7],
  'msus2': [0, 3, 2, 7],  // マイナー・サスツー（理論上ほぼ使いませんが、入力されたときのエラー防止用）
  'Msus2': [0, 2, 7]  
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
    const inputNotes = rawMessage.split(/\s+/).map(note => {
      if (!note) return '';
      return note.charAt(0).toUpperCase() + note.slice(1);
    }).filter(note => note !== '');

    const nums = inputNotes.map(note => NOTE_TO_NUM[note]).filter(num => num !== undefined);

    if (nums.length < 2) {
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '【判定結果】\n音を2つ以上正しく入力してください (例: C E G)' }]
      });
    }

    const rootNum = nums[0];
    const intervals = nums.slice(1).map(num => (num - rootNum + 12) % 12).sort((a, b) => a - b);
    const intervalKey = intervals.join(',');
    const chordType = CHORD_DICTIONARY[intervalKey];

    // ★追加：入力された最初の音がフラット表記（-）なら、出力もフラット用のリストを使う
    const isFlatMode = inputNotes[0].includes('-');
    const currentNoteMap = isFlatMode ? FLAT_NOTES : SHARP_NOTES;

    let replyText = '';
    if (chordType !== undefined) {
      replyText = `【判定結果】\n入力: ${inputNotes.join(', ')}\nコード: ${currentNoteMap[rootNum]}${chordType}`;
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
      // ★追加：指定されたコードのルートがフラット（-）なら、構成音もフラット表記にする
      const isFlatMode = formattedRoot.includes('-');
      const currentNoteMap = isFlatMode ? FLAT_NOTES : SHARP_NOTES;

      const resultNotes = intervals.map(interval => {
        const noteNum = (rootNum + interval) % 12;
        return currentNoteMap[noteNum]; // 判定されたモードの音名を返す
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