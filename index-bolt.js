require('dotenv').config();
const { App } = require('@slack/bolt');
const { v4: uuidv4 } = require('uuid');

// データベース初期化
const {
  initDatabase,
  saveQuestion,
  getQuestion,
  updateQuestionStatus,
  saveAnswer,
  getUnansweredQuestions,
  searchQuestions,
  getStatistics
} = require('./data-storage');

// Slack Appの初期化（Socket Mode）
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3000
});

const adminChannelId = process.env.ADMIN_CHANNEL_ID;

// データベース初期化
initDatabase();

// ==========================
// スラッシュコマンド
// ==========================

// /question コマンド - 質問を投稿（モーダル表示）
app.command('/question', async ({ command, ack, client }) => {
  await ack();

  try {
    console.log('Opening modal for user:', command.user_id);

    await client.views.open({
      trigger_id: command.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'question_modal',
        title: {
          type: 'plain_text',
          text: '質問を投稿'
        },
        blocks: [
          {
            type: 'input',
            block_id: 'category_block',
            label: {
              type: 'plain_text',
              text: 'カテゴリ'
            },
            element: {
              type: 'static_select',
              action_id: 'category_select',
              placeholder: {
                type: 'plain_text',
                text: 'カテゴリを選択'
              },
              options: [
                {
                  text: { type: 'plain_text', text: '技術的な質問' },
                  value: 'technical'
                },
                {
                  text: { type: 'plain_text', text: '業務プロセス' },
                  value: 'process'
                },
                {
                  text: { type: 'plain_text', text: '一般的な質問' },
                  value: 'general'
                },
                {
                  text: { type: 'plain_text', text: 'その他' },
                  value: 'other'
                }
              ]
            }
          },
          {
            type: 'input',
            block_id: 'question_block',
            label: {
              type: 'plain_text',
              text: '質問内容'
            },
            element: {
              type: 'plain_text_input',
              action_id: 'question_input',
              multiline: true,
              placeholder: {
                type: 'plain_text',
                text: '質問を入力してください...'
              }
            }
          },
          {
            type: 'input',
            block_id: 'context_block',
            optional: true,
            label: {
              type: 'plain_text',
              text: '背景・詳細情報'
            },
            element: {
              type: 'plain_text_input',
              action_id: 'context_input',
              multiline: true,
              placeholder: {
                type: 'plain_text',
                text: '追加の背景情報があれば入力してください...'
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

// /question-stats コマンド - 統計情報を表示
app.command('/question-stats', async ({ command, ack, say }) => {
  await ack();

  try {
    const stats = await getStatistics();

    const statsMessage = `
📊 *質問統計情報*

総質問数: ${stats.total || 0}
未回答: ${stats.pending || 0}
回答済み: ${stats.answered || 0}
解決済み: ${stats.resolved || 0}

回答率: ${stats.total > 0 ? Math.round((stats.answered + stats.resolved) / stats.total * 100) : 0}%
    `;

    await say({
      text: statsMessage,
      channel: command.channel_id
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    await say({
      text: '統計情報の取得中にエラーが発生しました。',
      channel: command.channel_id
    });
  }
});

// ==========================
// モーダルビューの処理
// ==========================

app.view('question_modal', async ({ ack, body, view, client }) => {
  await ack();

  const userId = body.user.id;
  const values = view.state.values;

  const category = values.category_block.category_select.selected_option.value;
  const question = values.question_block.question_input.value;
  const context = values.context_block?.context_input?.value || '';

  const questionId = uuidv4();
  const fullText = context ? `${question}\n\n背景情報: ${context}` : question;

  // 質問を保存
  await saveQuestion({
    id: questionId,
    userId: userId,
    text: fullText,
    category: category,
    status: 'pending'
  });

  try {
    // ユーザーに確認メッセージを送信
    await client.chat.postMessage({
      channel: userId,
      text: '📝 質問を受け付けました！',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📝 *質問を受け付けました！*\n\n*カテゴリ:* ${category}\n*質問:* ${question}\n\n担当者が確認次第、回答いたします。`
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `質問ID: \`${questionId}\``
            }
          ]
        }
      ]
    });

    // 管理者チャンネルに通知
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
              text: `*投稿者:* <@${userId}>\n*カテゴリ:* ${category}`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*質問:*\n${fullText}`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '✅ 回答する'
                },
                style: 'primary',
                action_id: 'answer_question',
                value: questionId
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '📋 類似の質問を確認'
                },
                action_id: 'check_similar',
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
  } catch (error) {
    console.error('Error processing question:', error);
  }
});

// ==========================
// インタラクティブコンポーネント
// ==========================

// 回答ボタンの処理
app.action('answer_question', async ({ ack, body, client, action }) => {
  await ack();

  const questionId = action.value;

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'answer_modal',
        private_metadata: questionId,
        title: {
          type: 'plain_text',
          text: '回答を入力'
        },
        blocks: [
          {
            type: 'input',
            block_id: 'answer_block',
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
                text: '回答を入力してください...'
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
    console.error('Error opening answer modal:', error);
  }
});

// 回答モーダルの処理
app.view('answer_modal', async ({ ack, body, view, client }) => {
  await ack();

  const questionId = view.private_metadata;
  const answeredBy = body.user.id;
  const answer = view.state.values.answer_block.answer_input.value;

  // 回答を保存
  await saveAnswer({
    questionId: questionId,
    answeredBy: answeredBy,
    answer: answer
  });

  // 質問のステータスを更新
  await updateQuestionStatus(questionId, 'answered');

  // 質問情報を取得
  const question = await getQuestion(questionId);

  if (question) {
    // 質問者に回答を通知
    await client.chat.postMessage({
      channel: question.user_id,
      text: '回答が届きました',
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
            text: `*あなたの質問:*\n${question.text}`
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*回答:*\n${answer}`
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
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '👍 役に立った'
              },
              style: 'primary',
              action_id: 'helpful_feedback',
              value: questionId
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '👎 改善が必要'
              },
              action_id: 'needs_improvement',
              value: questionId
            }
          ]
        }
      ]
    });

    // 管理チャンネルに通知
    if (adminChannelId) {
      await client.chat.postMessage({
        channel: adminChannelId,
        text: `質問ID: ${questionId} に回答しました`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ <@${answeredBy}>が質問に回答しました\n質問ID: \`${questionId}\``
            }
          }
        ]
      });
    }
  }
});

// フィードバック処理
app.action('helpful_feedback', async ({ ack, body, client }) => {
  await ack();

  await client.chat.postEphemeral({
    channel: body.channel.id,
    user: body.user.id,
    text: 'フィードバックありがとうございます！ 👍'
  });
});

app.action('needs_improvement', async ({ ack, body, client }) => {
  await ack();

  await client.chat.postEphemeral({
    channel: body.channel.id,
    user: body.user.id,
    text: 'フィードバックありがとうございます。改善に努めます。'
  });
});

// 類似質問の確認
app.action('check_similar', async ({ ack, body, client }) => {
  await ack();

  // TODO: 類似質問の検索と表示
  await client.chat.postEphemeral({
    channel: body.channel.id,
    user: body.user.id,
    text: '類似質問の検索機能は開発中です。'
  });
});

// ==========================
// メンション・DMイベント
// ==========================

app.event('app_mention', async ({ event, client }) => {
  // botのメッセージは無視
  if (event.bot_id) return;

  const questionId = uuidv4();
  const question = {
    id: questionId,
    userId: event.user,
    text: event.text.replace(/<@.*?>/g, '').trim(),
    channelId: event.channel,
    messageTs: event.ts,
    status: 'pending'
  };

  await saveQuestion(question);

  // ユーザーに受付確認を返信
  await client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.ts,
    text: '📝 ご質問を受け付けました！\n担当者が確認次第、回答させていただきます。',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '📝 *ご質問を受け付けました！*\n担当者が確認次第、このスレッドで回答させていただきます。'
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `質問ID: \`${questionId}\``
          }
        ]
      }
    ]
  });

  // 管理者チャンネルに通知
  if (adminChannelId) {
    await client.chat.postMessage({
      channel: adminChannelId,
      text: `新しい質問が投稿されました（メンション）`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📮 *新しい質問（メンション）*\n\n*投稿者:* <@${event.user}>\n*質問:* ${question.text}`
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `質問ID: \`${questionId}\` | チャンネル: <#${event.channel}>`
            }
          ]
        }
      ]
    });
  }
});

app.event('message', async ({ event, client }) => {
  // botのメッセージとスレッドの返信は無視
  if (event.bot_id || event.thread_ts) return;

  // DMの場合のみ処理
  if (event.channel_type === 'im') {
    const questionId = uuidv4();
    const question = {
      id: questionId,
      userId: event.user,
      text: event.text,
      channelId: event.channel,
      messageTs: event.ts,
      status: 'pending'
    };

    await saveQuestion(question);

    // ユーザーに受付確認を返信
    await client.chat.postMessage({
      channel: event.channel,
      text: '📝 ご質問を受け付けました！\n担当者が確認次第、回答させていただきます。',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '📝 *ご質問を受け付けました！*\n担当者が確認次第、回答させていただきます。'
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `質問ID: \`${questionId}\``
            }
          ]
        }
      ]
    });

    // 管理者チャンネルに通知
    if (adminChannelId) {
      await client.chat.postMessage({
        channel: adminChannelId,
        text: `新しい質問が投稿されました（DM）`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📮 *新しい質問（DM）*\n\n*投稿者:* <@${event.user}>\n*質問:* ${question.text}`
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `質問ID: \`${questionId}\``
              }
            ]
          }
        ]
      });
    }
  }
});

// ==========================
// アプリケーションの起動
// ==========================

(async () => {
  await app.start();
  console.log('⚡️ Slack Question Bot (Bolt) is running!');
  console.log('Socket Mode: Enabled');
  console.log('Commands: /question, /question-stats');
})();