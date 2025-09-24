require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const app = express();

// Body parserの設定
app.use(bodyParser.urlencoded({
  extended: true,
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

// ヘルスチェック
app.get('/', (req, res) => {
  res.send('Slack Question Bot is running! 🤖');
});

// スラッシュコマンド
app.post('/slack/commands', (req, res) => {
  console.log('Received command:', req.body.command);

  // Slack署名の検証（簡略版）
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];

  if (!signature || !timestamp) {
    console.error('Missing headers');
    return res.status(401).send('Unauthorized');
  }

  // すぐに200を返す（Slackは3秒以内のレスポンスを要求）
  res.status(200).json({
    response_type: 'ephemeral',
    text: '質問フォームの準備中です...'
  });
});

// インタラクティブエンドポイント
app.post('/slack/events', (req, res) => {
  console.log('Received interactive event');
  res.status(200).send();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✨ Minimal Webhook Server running on port ${PORT}`);
  console.log('Environment check:');
  console.log('- SLACK_BOT_TOKEN:', process.env.SLACK_BOT_TOKEN ? 'SET' : 'NOT SET');
  console.log('- SLACK_SIGNING_SECRET:', process.env.SLACK_SIGNING_SECRET ? 'SET' : 'NOT SET');
  console.log('- ADMIN_CHANNEL_ID:', process.env.ADMIN_CHANNEL_ID ? 'SET' : 'NOT SET');
  console.log('- PORT:', PORT);
});