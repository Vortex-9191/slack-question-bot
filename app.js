require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { WebClient } = require('@slack/web-api');
const crypto = require('crypto');

const app = express();

// ===============================
// 環境変数チェック
// ===============================
console.log('🔧 環境変数チェック...');
const requiredEnvVars = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ 必須環境変数が設定されていません:', missingEnvVars);
  console.log('現在の環境変数:');
  console.log('  SLACK_BOT_TOKEN:', process.env.SLACK_BOT_TOKEN ? '設定済み' : '未設定');
  console.log('  SLACK_SIGNING_SECRET:', process.env.SLACK_SIGNING_SECRET ? '設定済み' : '未設定');
  console.log('  ADMIN_CHANNEL_ID:', process.env.ADMIN_CHANNEL_ID || '未設定');
  process.exit(1);
}

// ===============================
// Slack WebClient初期化
// ===============================
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const adminChannelId = process.env.ADMIN_CHANNEL_ID;

console.log('✅ Slack WebClient初期化完了');

// ===============================
// ミドルウェア設定
// ===============================
// Raw bodyを保存しつつ、通常のパースも行う
app.use(bodyParser.urlencoded({
  extended: true,
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

// JSONボディもサポート
app.use(bodyParser.json());

// リクエストログ
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  if (req.method === 'POST') {
    console.log('Headers:', {
      'content-type': req.headers['content-type'],
      'x-slack-signature': req.headers['x-slack-signature'] ? '存在' : '不存在',
      'x-slack-request-timestamp': req.headers['x-slack-request-timestamp'] ? '存在' : '不存在'
    });
  }
  next();
});

// ===============================
// Slack署名検証
// ===============================
function verifySlackSignature(req) {
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  const body = req.rawBody || '';

  console.log('🔐 署名検証開始...');

  if (!signature || !timestamp) {
    console.error('❌ 署名またはタイムスタンプヘッダーが不足');
    return false;
  }

  // タイムスタンプの確認（5分以内）
  const time = Math.floor(new Date().getTime() / 1000);
  if (Math.abs(time - parseInt(timestamp)) > 60 * 5) {
    console.error('❌ リクエストが古すぎます');
    return false;
  }

  // 署名の計算
  const sigBasestring = 'v0:' + timestamp + ':' + body;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
    .update(sigBasestring, 'utf8')
    .digest('hex');

  // 署名の比較
  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(mySignature, 'utf8'),
      Buffer.from(signature, 'utf8')
    );

    if (isValid) {
      console.log('✅ 署名検証成功');
    } else {
      console.error('❌ 署名が一致しません');
    }

    return isValid;
  } catch (error) {
    console.error('❌ 署名検証エラー:', error.message);
    return false;
  }
}

// ===============================
// ルートエンドポイント
// ===============================
app.get('/', (req, res) => {
  const status = {
    status: 'running',
    app: 'Slack Question Bot',
    version: '2.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/',
      slash_commands: '/slack/slash-commands',
      interactive: '/slack/interactive'
    },
    environment: {
      bot_token: !!process.env.SLACK_BOT_TOKEN,
      signing_secret: !!process.env.SLACK_SIGNING_SECRET,
      admin_channel: process.env.ADMIN_CHANNEL_ID || '未設定'
    }
  };

  res.json(status);
});

// ===============================
// スラッシュコマンドエンドポイント
// ===============================
app.post('/slack/slash-commands', async (req, res) => {
  console.log('\n📮 ======================');
  console.log('スラッシュコマンド受信');
  console.log('======================');

  try {
    // デバッグ用ログ
    console.log('コマンド:', req.body.command);
    console.log('ユーザー:', req.body.user_id);
    console.log('チャンネル:', req.body.channel_id);
    console.log('Trigger ID:', req.body.trigger_id ? '存在' : '不存在');

    // 署名検証（本番環境のみ）
    if (process.env.NODE_ENV === 'production' || process.env.VERIFY_SIGNATURE === 'true') {
      if (!verifySlackSignature(req)) {
        console.error('❌ 署名検証失敗');
        return res.status(401).send('Unauthorized');
      }
    } else {
      console.log('⚠️  開発モード：署名検証をスキップ');
    }

    const { command, trigger_id, user_id, text } = req.body;

    // Slackに即座にレスポンス（3秒以内）
    res.status(200).send('');

    if (command === '/question') {
      console.log('📝 質問モーダルを開く...');

      try {
        const modalResult = await slackClient.views.open({
          trigger_id: trigger_id,
          view: {
            type: 'modal',
            callback_id: 'question_submission',
            title: {
              type: 'plain_text',
              text: '質問フォーム',
              emoji: true
            },
            submit: {
              type: 'plain_text',
              text: '送信',
              emoji: true
            },
            close: {
              type: 'plain_text',
              text: 'キャンセル',
              emoji: true
            },
            blocks: [
              {
                type: 'input',
                block_id: 'patient_id_block',
                element: {
                  type: 'plain_text_input',
                  action_id: 'patient_id',
                  placeholder: {
                    type: 'plain_text',
                    text: '例: P12345'
                  }
                },
                label: {
                  type: 'plain_text',
                  text: '患者ID',
                  emoji: true
                }
              },
              {
                type: 'input',
                block_id: 'question_type_block',
                element: {
                  type: 'static_select',
                  action_id: 'question_type',
                  placeholder: {
                    type: 'plain_text',
                    text: '選択してください'
                  },
                  options: [
                    {
                      text: {
                        type: 'plain_text',
                        text: '会計'
                      },
                      value: 'accounting'
                    },
                    {
                      text: {
                        type: 'plain_text',
                        text: 'CS'
                      },
                      value: 'cs'
                    },
                    {
                      text: {
                        type: 'plain_text',
                        text: '疑義紹介'
                      },
                      value: 'inquiry'
                    }
                  ]
                },
                label: {
                  type: 'plain_text',
                  text: '質問タイプ',
                  emoji: true
                }
              },
              {
                type: 'input',
                block_id: 'doctor_name_block',
                element: {
                  type: 'plain_text_input',
                  action_id: 'doctor_name',
                  placeholder: {
                    type: 'plain_text',
                    text: '例: 田中太郎'
                  }
                },
                label: {
                  type: 'plain_text',
                  text: '担当医師名',
                  emoji: true
                }
              },
              {
                type: 'input',
                block_id: 'doctor_id_block',
                element: {
                  type: 'plain_text_input',
                  action_id: 'doctor_id',
                  placeholder: {
                    type: 'plain_text',
                    text: '例: D001'
                  }
                },
                label: {
                  type: 'plain_text',
                  text: '担当医師ID',
                  emoji: true
                }
              },
              {
                type: 'input',
                block_id: 'question_content_block',
                element: {
                  type: 'plain_text_input',
                  action_id: 'question_content',
                  multiline: true,
                  placeholder: {
                    type: 'plain_text',
                    text: '質問内容を入力してください...'
                  }
                },
                label: {
                  type: 'plain_text',
                  text: '質問内容',
                  emoji: true
                }
              }
            ]
          }
        });

        console.log('✅ モーダル表示成功');
        console.log('View ID:', modalResult.view.id);

      } catch (modalError) {
        console.error('❌ モーダル表示エラー:', modalError);
        if (modalError.data) {
          console.error('エラー詳細:', modalError.data);
        }

        // エラーをユーザーに通知
        try {
          await slackClient.chat.postMessage({
            channel: user_id,
            text: '⚠️ 質問フォームの表示に失敗しました。もう一度お試しください。'
          });
        } catch (messageError) {
          console.error('メッセージ送信エラー:', messageError);
        }
      }
    }
  } catch (error) {
    console.error('❌ スラッシュコマンドエラー:', error);
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error');
    }
  }
});

// ===============================
// インタラクティブエンドポイント
// ===============================
app.post('/slack/interactive', async (req, res) => {
  console.log('\n🔄 ======================');
  console.log('インタラクティブイベント受信');
  console.log('======================');

  try {
    // 署名検証（本番環境のみ）
    if (process.env.NODE_ENV === 'production' || process.env.VERIFY_SIGNATURE === 'true') {
      if (!verifySlackSignature(req)) {
        console.error('❌ 署名検証失敗');
        return res.status(401).send('Unauthorized');
      }
    }

    const payload = JSON.parse(req.body.payload);
    console.log('イベントタイプ:', payload.type);
    console.log('ユーザー:', payload.user.id);

    if (payload.type === 'view_submission') {
      console.log('📋 フォーム送信処理...');

      const values = payload.view.state.values;

      // フォームデータ取得
      const formData = {
        patientId: values.patient_id_block.patient_id.value,
        questionType: values.question_type_block.question_type.selected_option.value,
        questionTypeLabel: values.question_type_block.question_type.selected_option.text.text,
        doctorName: values.doctor_name_block.doctor_name.value,
        doctorId: values.doctor_id_block.doctor_id.value,
        questionContent: values.question_content_block.question_content.value,
        userId: payload.user.id,
        userName: payload.user.name,
        timestamp: new Date().toISOString()
      };

      console.log('フォームデータ:', {
        ...formData,
        questionContent: formData.questionContent.substring(0, 50) + '...'
      });

      // モーダルを閉じる
      res.status(200).json({
        response_action: 'clear'
      });

      // ユーザーへの確認メッセージ
      try {
        await slackClient.chat.postMessage({
          channel: payload.user.id,
          text: '質問を受け付けました',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '✅ 質問を受け付けました'
              }
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*患者ID:*\n${formData.patientId}`
                },
                {
                  type: 'mrkdwn',
                  text: `*質問タイプ:*\n${formData.questionTypeLabel}`
                },
                {
                  type: 'mrkdwn',
                  text: `*担当医師:*\n${formData.doctorName}`
                },
                {
                  type: 'mrkdwn',
                  text: `*医師ID:*\n${formData.doctorId}`
                }
              ]
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*質問内容:*\n${formData.questionContent}`
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `送信日時: ${new Date().toLocaleString('ja-JP')}`
                }
              ]
            }
          ]
        });
        console.log('✅ ユーザーへの確認メッセージ送信完了');
      } catch (error) {
        console.error('❌ ユーザーへのメッセージ送信エラー:', error);
      }

      // 管理チャンネルへの通知
      if (adminChannelId) {
        try {
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
                  text: `*投稿者:* <@${payload.user.id}>`
                }
              },
              {
                type: 'section',
                fields: [
                  {
                    type: 'mrkdwn',
                    text: `*患者ID:*\n${formData.patientId}`
                  },
                  {
                    type: 'mrkdwn',
                    text: `*質問タイプ:*\n${formData.questionTypeLabel}`
                  },
                  {
                    type: 'mrkdwn',
                    text: `*担当医師:*\n${formData.doctorName}`
                  },
                  {
                    type: 'mrkdwn',
                    text: `*医師ID:*\n${formData.doctorId}`
                  }
                ]
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*質問内容:*\n${formData.questionContent}`
                }
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `投稿日時: ${new Date().toLocaleString('ja-JP')}`
                  }
                ]
              }
            ]
          });
          console.log('✅ 管理チャンネルへの通知送信完了');
        } catch (error) {
          console.error('❌ 管理チャンネルへのメッセージ送信エラー:', error);
        }
      }

    } else {
      // その他のインタラクションは200 OKを返す
      res.status(200).send();
    }
  } catch (error) {
    console.error('❌ インタラクティブエンドポイントエラー:', error);

    if (!res.headersSent) {
      res.status(500).json({
        response_action: 'errors',
        errors: {
          general: 'エラーが発生しました。もう一度お試しください。'
        }
      });
    }
  }
});

// ===============================
// 404ハンドラー
// ===============================
app.use((req, res) => {
  console.log(`⚠️  404 Not Found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.path} not found`,
    availableEndpoints: {
      health: 'GET /',
      slashCommands: 'POST /slack/slash-commands',
      interactive: 'POST /slack/interactive'
    }
  });
});

// ===============================
// エラーハンドラー
// ===============================
app.use((err, req, res, next) => {
  console.error('❌ サーバーエラー:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message
  });
});

// ===============================
// Slack API接続テスト
// ===============================
async function testSlackConnection() {
  try {
    console.log('\n🔌 Slack API接続テスト開始...');
    const result = await slackClient.auth.test();
    console.log('✅ Slack API接続成功！');
    console.log('  ボット名:', result.user);
    console.log('  チーム名:', result.team);
    console.log('  ボットID:', result.user_id);
    return true;
  } catch (error) {
    console.error('❌ Slack API接続失敗');
    console.error('  エラー:', error.message);
    if (error.data) {
      console.error('  詳細:', error.data);
    }
    return false;
  }
}

// ===============================
// サーバー起動
// ===============================
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, async () => {
  console.log('\n========================================');
  console.log('🚀 Slack Question Bot v2.0');
  console.log('========================================');
  console.log(`📡 サーバーポート: ${PORT}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log('\n📋 エンドポイント:');
  console.log('  GET  / ..................... ヘルスチェック');
  console.log('  POST /slack/slash-commands . スラッシュコマンド');
  console.log('  POST /slack/interactive .... インタラクティブイベント');
  console.log('\n🔧 環境設定:');
  console.log('  SLACK_BOT_TOKEN ........... 設定済み');
  console.log('  SLACK_SIGNING_SECRET ...... 設定済み');
  console.log('  ADMIN_CHANNEL_ID .......... ' + (adminChannelId || '未設定'));
  console.log('========================================\n');

  // 起動後にSlack API接続テスト
  setTimeout(async () => {
    await testSlackConnection();
  }, 2000);
});

// ===============================
// グレースフルシャットダウン
// ===============================
process.on('SIGTERM', () => {
  console.log('\n📴 SIGTERM信号を受信、サーバーを停止します...');
  server.close(() => {
    console.log('✅ サーバー停止完了');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n📴 SIGINT信号を受信、サーバーを停止します...');
  server.close(() => {
    console.log('✅ サーバー停止完了');
    process.exit(0);
  });
});