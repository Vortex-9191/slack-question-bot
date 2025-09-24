require('dotenv').config();
const { App, ExpressReceiver } = require('@slack/bolt');
const { v4: uuidv4 } = require('uuid');

// データベース初期化
const {
  initDatabase,
  saveQuestion,
  getQuestion,
  updateQuestionStatus,
  saveAnswer,
  saveApproval
} = require('./data-storage-enhanced');

// Express Receiverを使用（Webhook用）
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// Slack Appの初期化（Webhook方式）
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
  // Socket Modeは使用しない
  socketMode: false
});

const adminChannelId = process.env.ADMIN_CHANNEL_ID;

// データベース初期化
initDatabase();

// 質問タイプの定義
const QUESTION_TYPES = {
  technical: '技術的な質問',
  business: 'ビジネス関連',
  process: 'プロセス・手順',
  general: '一般的な質問',
  urgent: '緊急の質問',
  other: 'その他'
};

// ヘルスチェックエンドポイント
receiver.router.get('/', (req, res) => {
  res.send('Slack Question Bot is running! 🤖');
});

// ==========================
// スラッシュコマンド
// ==========================

// /question - 質問フォームを開く
app.command('/question', async ({ command, ack, client }) => {
  await ack();

  try {
    await client.views.open({
      trigger_id: command.trigger_id,
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
                text: '内容を入力する'
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
                text: 'オプションを選択する'
              },
              options: Object.entries(QUESTION_TYPES).map(([value, text]) => ({
                text: {
                  type: 'plain_text',
                  text: text
                },
                value: value
              }))
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
                text: '内容を入力する'
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
                text: '内容を入力する'
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
  } catch (error) {
    console.error('Error opening modal:', error);
  }
});

// モーダル送信の処理
app.view('question_submission', async ({ ack, body, view, client }) => {
  await ack();

  const values = view.state.values;
  const userId = body.user.id;
  const questionId = uuidv4();

  // フォームデータを収集
  const patientId = values.patient_id.patient_id_input.value;
  const questionType = values.question_type.question_type_select.selected_option.value;
  const doctorName = values.doctor_name.doctor_name_input.value;
  const doctorId = values.doctor_id.doctor_id_input.value;
  const questionContent = values.question_content.question_content_input.value;

  // データベースに保存
  const question = {
    id: questionId,
    userId: userId,
    type: questionType,
    title: `${QUESTION_TYPES[questionType]} - 患者ID: ${patientId}`,
    details: JSON.stringify({
      patientId,
      doctorName,
      doctorId,
      questionContent
    }),
    urgency: 'normal',
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  await saveQuestion(question);

  // ユーザーに確認メッセージ
  await client.chat.postMessage({
    channel: userId,
    text: '質問を受け付けました',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📝 *質問を受け付けました*\n\n*患者ID:* ${patientId}\n*質問タイプ:* ${QUESTION_TYPES[questionType]}\n*担当医師:* ${doctorName} (${doctorId})\n\n*質問内容:*\n${questionContent}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `質問ID: \`${questionId}\` | 投稿時刻: ${new Date().toLocaleString('ja-JP')}`
          }
        ]
      }
    ]
  });

  // 管理チャンネルに通知
  if (adminChannelId) {
    await client.chat.postMessage({
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
            text: `*投稿者:* <@${userId}>\n*患者ID:* ${patientId}\n*質問タイプ:* ${QUESTION_TYPES[questionType]}\n*担当医師:* ${doctorName} (${doctorId})`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*質問内容:*\n${questionContent}`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '✅ 承認して回答'
              },
              style: 'primary',
              action_id: 'approve_question',
              value: questionId
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '❌ 却下'
              },
              style: 'danger',
              action_id: 'reject_question',
              value: questionId
            }
          ]
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `質問ID: \`${questionId}\` | 投稿時刻: ${new Date().toLocaleString('ja-JP')}`
            }
          ]
        }
      ]
    });
  }
});

// 承認ボタンの処理
app.action('approve_question', async ({ ack, body, client, action }) => {
  await ack();

  const questionId = action.value;
  const approverId = body.user.id;

  await updateQuestionStatus(questionId, 'approved');
  await saveApproval({
    questionId,
    approverId,
    action: 'approved',
    timestamp: new Date().toISOString()
  });

  // 回答用のモーダルを開く
  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'answer_submission',
      private_metadata: questionId,
      title: {
        type: 'plain_text',
        text: '回答を入力'
      },
      blocks: [
        {
          type: 'input',
          block_id: 'answer_text',
          label: {
            type: 'plain_text',
            text: '回答内容'
          },
          element: {
            type: 'plain_text_input',
            action_id: 'answer_input',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: '質問への回答を入力してください'
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

  // メッセージを更新
  await client.chat.update({
    channel: adminChannelId,
    ts: body.message.ts,
    text: body.message.text,
    blocks: [
      ...body.message.blocks.slice(0, -2),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `✅ *承認済み* - <@${approverId}>が回答中`
        }
      },
      body.message.blocks[body.message.blocks.length - 1]
    ]
  });
});

// 却下ボタンの処理
app.action('reject_question', async ({ ack, body, client, action }) => {
  await ack();

  const questionId = action.value;
  const rejecterId = body.user.id;

  await updateQuestionStatus(questionId, 'rejected');
  await saveApproval({
    questionId,
    approverId: rejecterId,
    action: 'rejected',
    timestamp: new Date().toISOString()
  });

  const question = await getQuestion(questionId);

  // 質問者に通知
  await client.chat.postMessage({
    channel: question.userId,
    text: '質問が却下されました',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `❌ 申し訳ございません。質問が却下されました。\n詳細については管理者にお問い合わせください。`
        }
      }
    ]
  });

  // 管理画面のメッセージを更新
  await client.chat.update({
    channel: adminChannelId,
    ts: body.message.ts,
    text: body.message.text,
    blocks: [
      ...body.message.blocks.slice(0, -2),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `❌ *却下済み* - <@${rejecterId}>により却下`
        }
      },
      body.message.blocks[body.message.blocks.length - 1]
    ]
  });
});

// 回答送信の処理
app.view('answer_submission', async ({ ack, body, view, client }) => {
  await ack();

  const questionId = view.private_metadata;
  const answerText = view.state.values.answer_text.answer_input.value;
  const answeredBy = body.user.id;

  const question = await getQuestion(questionId);

  // 回答を保存
  await saveAnswer({
    questionId,
    answeredBy,
    answerText,
    timestamp: new Date().toISOString()
  });

  await updateQuestionStatus(questionId, 'answered');

  // 質問者に回答を送信
  await client.chat.postMessage({
    channel: question.userId,
    text: '質問への回答',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '✅ 質問への回答'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*あなたの質問:*\n${JSON.parse(question.details).questionContent}\n\n*回答:*\n${answerText}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `回答者: <@${answeredBy}> | 質問ID: \`${questionId}\``
          }
        ]
      }
    ]
  });
});

// アプリケーションの起動
(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`⚡️ シンプル質問Bot (Webhook) is running on port ${port}!`);
  console.log('Commands: /question');
})();