require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { WebClient } = require('@slack/web-api');
const crypto = require('crypto');

const app = express();

// Raw bodyを保存（署名検証用）
app.use(bodyParser.urlencoded({
  extended: true,
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const adminChannelId = process.env.ADMIN_CHANNEL_ID;

// Slack署名検証
function verifySlackSignature(req) {
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  const body = req.rawBody || '';

  if (!signature || !timestamp) {
    console.error('Missing signature or timestamp headers');
    return false;
  }

  // 5分以内のリクエストのみ受け付ける
  const time = Math.floor(new Date().getTime() / 1000);
  if (Math.abs(time - timestamp) > 60 * 5) {
    console.error('Request timestamp is too old');
    return false;
  }

  const sigBasestring = 'v0:' + timestamp + ':' + body;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET || '')
    .update(sigBasestring, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(mySignature, 'utf8'),
    Buffer.from(signature, 'utf8')
  );
}

// ヘルスチェック
app.get('/', (req, res) => {
  res.send('Slack Question Bot is running! 🤖');
});

// スラッシュコマンド
app.post('/slack/slash-commands', async (req, res) => {
  console.log('=== Slash Command Received ===');
  console.log('Command:', req.body.command);
  console.log('User:', req.body.user_id);

  // 署名検証
  if (!verifySlackSignature(req)) {
    console.error('Failed to verify Slack signature');
    return res.status(401).send('Unauthorized');
  }

  const { command, trigger_id, user_id, text } = req.body;

  // 3秒以内にレスポンスを返す（Slackの要件）
  res.status(200).send();

  if (command === '/question') {
    try {
      console.log('Opening modal for user:', user_id);

      const result = await slackClient.views.open({
        trigger_id: trigger_id,
        view: {
          type: 'modal',
          callback_id: 'question_submission',
          title: {
            type: 'plain_text',
            text: '質問フォーム'
          },
          blocks: [
            {
              type: 'input',
              block_id: 'patient_id',
              label: {
                type: 'plain_text',
                text: '患者ID'
              },
              element: {
                type: 'plain_text_input',
                action_id: 'patient_id_input',
                placeholder: {
                  type: 'plain_text',
                  text: '患者IDを入力'
                }
              }
            },
            {
              type: 'input',
              block_id: 'question_type',
              label: {
                type: 'plain_text',
                text: '質問タイプ'
              },
              element: {
                type: 'static_select',
                action_id: 'question_type_select',
                placeholder: {
                  type: 'plain_text',
                  text: '選択してください'
                },
                options: [
                  {
                    text: { type: 'plain_text', text: '会計' },
                    value: 'accounting'
                  },
                  {
                    text: { type: 'plain_text', text: 'CS' },
                    value: 'cs'
                  },
                  {
                    text: { type: 'plain_text', text: '疑義紹介' },
                    value: 'inquiry'
                  }
                ]
              }
            },
            {
              type: 'input',
              block_id: 'doctor_name',
              label: {
                type: 'plain_text',
                text: '担当医師名'
              },
              element: {
                type: 'plain_text_input',
                action_id: 'doctor_name_input',
                placeholder: {
                  type: 'plain_text',
                  text: '医師名を入力'
                }
              }
            },
            {
              type: 'input',
              block_id: 'doctor_id',
              label: {
                type: 'plain_text',
                text: '担当医師ID'
              },
              element: {
                type: 'plain_text_input',
                action_id: 'doctor_id_input',
                placeholder: {
                  type: 'plain_text',
                  text: '医師IDを入力'
                }
              }
            },
            {
              type: 'input',
              block_id: 'question_content',
              label: {
                type: 'plain_text',
                text: '質問内容'
              },
              element: {
                type: 'plain_text_input',
                action_id: 'question_content_input',
                multiline: true,
                placeholder: {
                  type: 'plain_text',
                  text: '質問を入力してください'
                }
              }
            }
          ],
          submit: {
            type: 'plain_text',
            text: '送信'
          }
        }
      });

      console.log('Modal opened successfully');
    } catch (error) {
      console.error('Error opening modal:', error);
      console.error('Error details:', error.data);
    }
  }
});

// インタラクティブエンドポイント
app.post('/slack/interactive', async (req, res) => {
  console.log('=== Interactive Event Received ===');

  // 署名検証
  if (!verifySlackSignature(req)) {
    console.error('Failed to verify Slack signature');
    return res.status(401).send('Unauthorized');
  }

  try {
    const payload = JSON.parse(req.body.payload);
    console.log('Event type:', payload.type);
    console.log('User:', payload.user.id);

    if (payload.type === 'view_submission') {
      const values = payload.view.state.values;

      // フォームデータを取得
      const patientId = values.patient_id.patient_id_input.value;
      const questionType = values.question_type.question_type_select.selected_option.value;
      const doctorName = values.doctor_name.doctor_name_input.value;
      const doctorId = values.doctor_id.doctor_id_input.value;
      const questionContent = values.question_content.question_content_input.value;

      console.log('Form data received:', {
        patientId,
        questionType,
        doctorName,
        doctorId,
        questionContent: questionContent.substring(0, 50) + '...'
      });

      // モーダルを閉じる
      res.status(200).json({
        response_action: 'clear'
      });

      // ユーザーにDMで確認
      await slackClient.chat.postMessage({
        channel: payload.user.id,
        text: '質問を受け付けました',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📝 *質問を受け付けました*\n\n*患者ID:* ${patientId}\n*質問タイプ:* ${questionType}\n*担当医師:* ${doctorName} (${doctorId})\n\n*質問内容:*\n${questionContent}`
            }
          }
        ]
      });

      // 管理チャンネルに通知
      if (adminChannelId) {
        await slackClient.chat.postMessage({
          channel: adminChannelId,
          text: '新しい質問が投稿されました',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '📮 新しい質問'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*投稿者:* <@${payload.user.id}>\n*患者ID:* ${patientId}\n*質問タイプ:* ${questionType}\n*担当医師:* ${doctorName} (${doctorId})`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*質問内容:*\n${questionContent}`
              }
            }
          ]
        });
      }

      console.log('Messages sent successfully');
    } else {
      // その他のインタラクション
      res.status(200).send();
    }
  } catch (error) {
    console.error('Interactive error:', error);
    res.status(500).json({
      response_action: 'errors',
      errors: {
        general: 'エラーが発生しました。もう一度お試しください。'
      }
    });
  }
});

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✨ Stable Bot is running on port ${PORT}!`);
  console.log('Environment check:');
  console.log('  SLACK_BOT_TOKEN:', process.env.SLACK_BOT_TOKEN ? 'SET' : 'NOT SET');
  console.log('  SLACK_SIGNING_SECRET:', process.env.SLACK_SIGNING_SECRET ? 'SET' : 'NOT SET');
  console.log('  ADMIN_CHANNEL_ID:', process.env.ADMIN_CHANNEL_ID ? 'SET' : 'NOT SET');
  console.log('Endpoints:');
  console.log('  GET  / - Health check');
  console.log('  POST /slack/slash-commands');
  console.log('  POST /slack/interactive');
});