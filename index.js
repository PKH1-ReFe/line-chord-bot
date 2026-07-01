const express = require('express');
const line = require('@line/bot-sdk');const express = require('express');
const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const app = WebhookExpress = express();

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

const SHARP_NOTES = ['C', 'C+', 'D', 'D+', 'E', 'F', 'F+', 'G', 'G+', 'A', 'A+', 'B'];
const FLAT_NOTES  = ['C', 'D-', 'D', 'E-', 'E', 'F', 'G-', 'G', 'A-', 'A', 'B-', 'B'];

const CHORD_DICTIONARY = { 
  '4,7': '',        // メジャー
  '3,7': 'm',       // マイナー
  '4,7,11': 'M7',   // メジャーセブンス
  '4,7,10': '7',    // セブンス
  '3,7,10': 'm7',   // マイナーセブンス
  '5,7': 'sus4',    // サスフォー
  '4,7,14': '9',    // ナインス
  '2,4,7': '9',     
  '4,7,10,14': '9', 
  '2,4,7,10': '9',
  '3,7,10,14': 'm9', // マイナーナインス
  '2,3,7,10': 'm9',    
  '4,8': 'aug',     // オーグメント
  '3,6': 'dim',     // ディミニッシュ
  '3,6,9': 'dim7',  // ディミニッシュセブンス
  '2,7': 'sus2',    // サスツー
  '3,7,11': 'mM7',  // マイナーメジャーセブンス
  '3,6,10': 'm7-5', // ハーフディミニッシュ
  '4,7,10,14,17': '11', // イレブンス
  '2,4,5,7,10': '11',   
  '4,7,10,14,17,21': '13', // サーティーンス
  '2,4,7,9,10': '13'    
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
  'm9': [0, 3, 7, 10, 14], 
  'M9': [0, 4, 7, 10, 14],
  'aug': [0, 4, 8],
  'Maug': [0, 4, 8],     
  'maug': [0, 3, 8],     
  'dim': [0, 3, 6],
  'mdim': [0, 3, 6],  
  'Mdim': [0, 3, 6],    
  'dim7': [0, 3, 6, 9],
  'mdim7': [0, 3, 6, 9],  
  'Mdim7': [0, 3, 6, 9], 
  'sus2': [0, 2, 7],
  'msus2': [0, 3, 2, 7],  
  'Msus2': [0, 2, 7],
  'mM7': [0, 3, 7, 11],
  'm7-5': [0, 3, 6, 10],
  'm7b5': [0, 3, 6, 10],
  '11': [0, 4, 7, 10, 14, 17],
  'm11': [0, 3, 7, 10, 14, 17], 
  'M11': [0, 3, 7, 10, 14, 17],
  '13': [0, 4, 7, 10, 14, 17, 21],
  'm13': [0, 3, 7, 10, 14, 17, 21], 
  'M13': [0, 4, 7, 10, 14, 17, 21]
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

    const baseNote = inputNotes[0];
    const nums = inputNotes.map(note => NOTE_TO_NUM[note]).filter(num => num !== undefined);

    if (nums.length < 2) {
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '【判定結果】\n音を2つ以上正しく入力してください (例: C E G)' }]
      });
    }

    const sortedNums = [...new Set(nums)].sort((a, b) => a - b);
    const rootNum = sortedNums[0]; 

    const intervals = sortedNums.slice(1).map(num => (num - rootNum + 12) % 12).sort((a, b) => a - b);
    const intervalKey = intervals.join(',');
    const chordType = CHORD_DICTIONARY[intervalKey];

    const isFlatMode = inputNotes[0].includes('-');
    const currentNoteMap = isFlatMode ? FLAT_NOTES : SHARP_NOTES;

    let replyText = '';
    if (chordType !== undefined) {
      const chordRoot = currentNoteMap[rootNum]; 
      
      let finalChordName = `${chordRoot}${chordType}`;
      if (baseNote !== chordRoot) {
        finalChordName = `${finalChordName}/${baseNote}`; 
      }

      replyText = `【判定結果】\n入力: ${inputNotes.join(', ')}\nコード: ${finalChordName}`;
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
    let inputChord = rawMessage;
    let slashBase = ''; 

    if (inputChord.includes('/')) {
      const parts = inputChord.split('/');
      inputChord = parts[0]; 
      slashBase = parts[1].charAt(0).toUpperCase() + parts[1].slice(1); 
    }

    let root = '';
    let type = '';

    if (inputChord.length > 1 && (inputChord[1] === '+' || inputChord[1] === '-')) {
      root = inputChord.substring(0, 2);
      type = inputChord.substring(2);
    } else {
      root = inputChord.substring(0, 1);
      type = inputChord.substring(1);
    }

    const formattedRoot = root.charAt(0).toUpperCase() + root.slice(1);
    const rootNum = NOTE_TO_NUM[formattedRoot];
    const intervals = REVERSE_CHORD_DICTIONARY[type];

    if (rootNum !== undefined && intervals) {
      const isFlatMode = formattedRoot.includes('-') || slashBase.includes('-');
      const currentNoteMap = isFlatMode ? FLAT_NOTES : SHARP_NOTES;

      let resultNotes = intervals.map(interval => {
        const noteNum = (rootNum + interval) % 12;
        return currentNoteMap[noteNum];
      });

      // ★分数コード（/ があった）場合の【第二転回形もいける】修正版並び替え処理
      if (slashBase) {
        const baseNum = NOTE_TO_NUM[slashBase];
        
        const remainingNotes = resultNotes
          .filter(note => note !== slashBase)
          .sort((a, b) => {
            const distA = (NOTE_TO_NUM[a] - baseNum + 12) % 12;
            const distB = (NOTE_TO_NUM[b] - baseNum + 12) % 12;
            return distA - distB;
          });
        
        resultNotes = [slashBase, ...remainingNotes];
      }

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
