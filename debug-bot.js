require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { WebClient } = require('@slack/web-api');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 環境変数の確認
console.log('=== ENVIRONMENT CHECK ===');
console.log('SLACK_BOT_TOKEN exists:', !!process.env.SLACK_BOT_TOKEN);
console.log('SLACK_SIGNING_SECRET exists:', !!process.env.SLACK_SIGNING_SECRET);
console.log('ADMIN_CHANNEL_ID:', process.env.ADMIN_CHANNEL_ID || 'NOT SET');

// WebClientの初期化をtry-catchで囲む
let slackClient;
try {
  slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
  console.log('WebClient initialized');
} catch (error) {
  console.error('Failed to initialize WebClient:', error);
}

// ヘルスチェック
app.get('/', (req, res) => {
  const status = {
    status: 'running',
    timestamp: new Date().toISOString(),
    env: {
      bot_token: !!process.env.SLACK_BOT_TOKEN,
      signing_secret: !!process.env.SLACK_SIGNING_SECRET,
      admin_channel: process.env.ADMIN_CHANNEL_ID || 'NOT SET'
    }
  };
  res.json(status);
});

// スラッシュコマンド - 最小限の実装
app.post('/slack/slash-commands', async (req, res) => {
  console.log('=== SLASH COMMAND RECEIVED ===');
  console.log('Headers:', {
    'x-slack-signature': req.headers['x-slack-signature'] ? 'EXISTS' : 'MISSING',
    'x-slack-request-timestamp': req.headers['x-slack-request-timestamp'] ? 'EXISTS' : 'MISSING'
  });
  console.log('Body:', {
    command: req.body.command,
    user_id: req.body.user_id,
    trigger_id: req.body.trigger_id ? 'EXISTS' : 'MISSING'
  });

  // すぐにレスポンスを返す
  res.status(200).send('コマンドを受信しました。処理中...');

  // trigger_idがあればモーダルを開く
  if (req.body.trigger_id && slackClient) {
    try {
      console.log('Attempting to open modal...');

      const result = await slackClient.views.open({
        trigger_id: req.body.trigger_id,
        view: {
          type: 'modal',
          callback_id: 'test_modal',
          title: {
            type: 'plain_text',
            text: 'デバッグテスト'
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '接続テスト成功！'
              }
            }
          ],
          close: {
            type: 'plain_text',
            text: '閉じる'
          }
        }
      });

      console.log('Modal opened successfully:', result.ok);
    } catch (error) {
      console.error('=== MODAL OPEN ERROR ===');
      console.error('Error message:', error.message);
      if (error.data) {
        console.error('Error data:', error.data);
      }
    }
  }
});

// インタラクティブエンドポイント
app.post('/slack/interactive', (req, res) => {
  console.log('Interactive endpoint hit');
  res.status(200).send();
});

// Slack API接続テスト
async function testSlackConnection() {
  if (!slackClient) {
    console.error('SlackClient not initialized');
    return;
  }

  try {
    console.log('\n=== TESTING SLACK API CONNECTION ===');
    const result = await slackClient.auth.test();
    console.log('✅ API Connection Success!');
    console.log('  Bot User:', result.user);
    console.log('  Team:', result.team);
    console.log('  Bot ID:', result.user_id);
  } catch (error) {
    console.error('❌ API Connection Failed!');
    console.error('  Error:', error.message);
    if (error.data) {
      console.error('  Details:', error.data);
    }
  }
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`\n✨ Debug Bot is running on port ${PORT}!`);
  console.log('Endpoints:');
  console.log('  GET  / - Status check');
  console.log('  POST /slack/slash-commands');
  console.log('  POST /slack/interactive');

  // 起動後にAPI接続テスト
  setTimeout(testSlackConnection, 2000);
});