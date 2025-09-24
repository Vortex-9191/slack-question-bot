require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { WebClient } = require('@slack/web-api');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

// ヘルスチェック
app.get('/', (req, res) => {
  res.send('Slack Question Bot is running! 🤖');
});

// スラッシュコマンドのエンドポイント（index.jsと同じパス）
app.post('/slack/slash-commands', async (req, res) => {
  console.log('Received command:', req.body.command);

  const { command, trigger_id, text } = req.body;

  // すぐに200 OKを返す（重要：3秒以内）
  res.status(200).send();

  if (command === '/question') {
    try {
      // シンプルなモーダルを開く
      await slackClient.views.open({
        trigger_id: trigger_id,
        view: {
          type: 'modal',
          callback_id: 'question_modal',
          title: {
            type: 'plain_text',
            text: '質問フォーム'
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '質問フォームのテスト'
              }
            },
            {
              type: 'input',
              block_id: 'test_input',
              label: {
                type: 'plain_text',
                text: 'テスト入力'
              },
              element: {
                type: 'plain_text_input',
                action_id: 'test_action'
              }
            }
          ],
          submit: {
            type: 'plain_text',
            text: '送信'
          }
        }
      });
    } catch (error) {
      console.error('Error opening modal:', error);
    }
  }
});

// インタラクティブエンドポイント
app.post('/slack/interactive', async (req, res) => {
  const payload = JSON.parse(req.body.payload);
  console.log('Interactive event type:', payload.type);

  // すぐに200 OKを返す
  res.status(200).send();

  if (payload.type === 'view_submission') {
    console.log('Form submitted successfully');
  }
});

// サーバー起動
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✨ Working Bot is running on port ${PORT}!`);
  console.log('Endpoints:');
  console.log('  GET  / - Health check');
  console.log('  POST /slack/slash-commands - Slash commands');
  console.log('  POST /slack/interactive - Interactive events');
});