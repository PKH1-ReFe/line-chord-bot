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
  '3,7,10,14': 'm9',   // 本来の度数の並び (例: C E- G B- D)
  '2,3,7,10': 'm9',    // 1オクターブ内に収めて打たれたとき用
  '4,8': 'aug',        // オーグメント (例: C E G+)
  '3,6': 'dim',        // ディミニッシュ (例: C E- G-)
  '3,6,9': 'dim7',     // ディミニッシュセブンス (例: C E- G- A)
  '2,7': 'sus2',        // サスツー (例: C D G)
  '3,7,11': 'mM7',      // マイナーメジャーセブンス (例: C E- G B)
  '3,6,10': 'm7-5',     // ハーフディミニッシュ (例: C E- G- B-) ※m7b5とも書きます
  '4,7,10,14,17': '11', // イレブンス (17マス上＝F / ループ考慮で下の '2,4,5,7,10' も追加)
  '2,4,5,7,10': '11',   // 1オクターブ内に収めて打たれたとき用
  '4,7,10,14,17,21': '13', // サーティーンス (21マス上＝A / ループ考慮で下の '2,4,7,9,10' も追加)
  '2,4,7,9,10': '13'    // 1オクターブ内に収めて打たれたとき用
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
  'm9': [0, 3, 7, 10, 14], // ルート、短3度、完全5度、短7度、長9度
  'M9': [0, 4, 7, 10, 14],
  
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
  'Msus2': [0, 2, 7],
  
  // --- mM7系 ---
  'mM7': [0, 3, 7, 11],

  // --- ハーフディミニッシュ系 ---
  'm7-5': [0, 3, 6, 10],

  // --- 11系 / 13系 ---
  '11': [0, 4, 7, 10, 14, 17],
  'm11': [0, 3, 7, 10, 14, 17], // マイナーイレブンス
  'M11': [0, 3, 7, 10, 14, 17],
  '13': [0, 4, 7, 10, 14, 17, 21],
  'm13': [0, 3, 7, 10, 14, 17, 21], // マイナーサーティーンス
  'M13':[0, 4, 7, 10, 14, 17, 21]
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

    // ★ここを追加！一番左（最初）に入力された音を「ベース音（最低音）」としてキープしておく
    const baseNote = inputNotes[0];

    // 入力された音をすべて数字に変換
    const nums = inputNotes.map(note => NOTE_TO_NUM[note]).filter(num => num !== undefined);

    if (nums.length < 2) {
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '【判定結果】\n音を2つ以上正しく入力してください (例: C E G)' }]
      });
    }

    // ★ここを変更！順不同に対応するため、一番低い音（数字が一番小さい音）を「コードのルート」として判定する
    const sortedNums = [...new Set(nums)].sort((a, b) => a - b);
    const rootNum = sortedNums[0]; // ソートした中の一番低い音

    // ルート音からの差（度数）を計算
    const intervals = sortedNums.slice(1).map(num => (num - rootNum + 12) % 12).sort((a, b) => a - b);
    const intervalKey = intervals.join(',');
    const chordType = CHORD_DICTIONARY[intervalKey];

    // 出力用のシャープ/フラットの判定
    const isFlatMode = inputNotes[0].includes('-');
    const currentNoteMap = isFlatMode ? FLAT_NOTES : SHARP_NOTES;

    let replyText = '';
    if (chordType !== undefined) {
      const chordRoot = currentNoteMap[rootNum]; // 判定されたコードの元々のルート音
      
      // ★ここを追加！もし「実際に最初に入力された最低音」と「コード本来のルート音」が違ったら分数コードにする
      let finalChordName = `${chordRoot}${chordType}`;
      if (baseNote !== chordRoot) {
        finalChordName = `${finalChordName}/${baseNote}`; // 例: C/E の形にする
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
    // ----------------------------------------------------
  // パターンB：入力にスペースがない場合【コード名 ⇒ 音（逆引き）】
  // ----------------------------------------------------
  else {
    let inputChord = rawMessage;
    let slashBase = ''; // スラッシュの後ろのベース音をキープする変数

    // ★ここを追加！ もし入力に「/」が含まれていたら、コードとベース音に切り分ける
    if (inputChord.includes('/')) {
      const parts = inputChord.split('/');
      inputChord = parts[0]; // スラッシュの前（例: C や F）
      slashBase = parts[1].charAt(0).toUpperCase() + parts[1].slice(1); // スラッシュの後ろ（例: E や G）
    }

    let root = '';
    let type = '';

    // ルート音の切り出し（切り分けた inputChord を使う）
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
      // 指定されたコードのルート（またはスラッシュベース）がフラットならフラットモードにする
      const isFlatMode = formattedRoot.includes('-') || slashBase.includes('-');
      const currentNoteMap = isFlatMode ? FLAT_NOTES : SHARP_NOTES;

      // 通常の構成音を計算
      let resultNotes = intervals.map(interval => {
        const noteNum = (rootNum + interval) % 12;
        return currentNoteMap[noteNum];
      });

      // ★ここを追加！ 分数コード（/ があった）の場合の並び替え処理
      if (slashBase) {
        // 構成音の中からベース音と同じ音を探して取り除く
        resultNotes = resultNotes.filter(note => note !== slashBase);
        // ベース音を一番左（最初）にくっつける
        resultNotes.unshift(slashBase);
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


const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました！`);
});      // ★【修正版】分数コードの並び替え処理
      if (slashBase) {
        const baseNum = NOTE_TO_NUM[slashBase];
        
        // 1. ベース音以外の音を、ベース音から数えて近い（低い）順に並び替える
        const remainingNotes = resultNotes
          .filter(note => note !== slashBase)
          .sort((a, b) => {
            const distA = (NOTE_TO_NUM[a] - baseNum + 12) % 12;
            const distB = (NOTE_TO_NUM[b] - baseNum + 12) % 12;
            return distA - distB;
          });
        
        // 2. 先頭にベース音を置いて合体！
        resultNotes = [slashBase, ...remainingNotes];
      }
      // ★【修正版】分数コードの並び替え処理
      if (slashBase) {
        const baseNum = NOTE_TO_NUM[slashBase];
        
        // 1. ベース音以外の音を、ベース音から数えて近い（低い）順に並び替える
        const remainingNotes = resultNotes
          .filter(note => note !== slashBase)
          .sort((a, b) => {
            const distA = (NOTE_TO_NUM[a] - baseNum + 12) % 12;
            const distB = (NOTE_TO_NUM[b] - baseNum + 12) % 12;
            return distA - distB;
          });
        
        // 2. 先頭にベース音を置いて合体！
        resultNotes = [slashBase, ...remainingNotes];
      }
