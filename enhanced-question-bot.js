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
  getQuestionStats,
  updateQuestion,
  saveApproval,
  saveFeedback
} = require('./data-storage-enhanced');

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

// 質問カテゴリの定義
const QUESTION_CATEGORIES = {
  patient_care: '患者ケア',
  medication: '薬剤関連',
  procedure: '処置・手術',
  diagnosis: '診断',
  documentation: '書類・記録',
  insurance: '保険・請求',
  general: '一般的な質問',
  other: 'その他'
};

// 緊急度の定義
const URGENCY_LEVELS = {
  low: '🟢 低',
  normal: '🟡 通常',
  high: '🟠 高',
  urgent: '🔴 緊急'
};

// ==========================
// スラッシュコマンド
// ==========================

// /ask - 質問フォームを開く
app.command('/ask', async ({ command, ack, client }) => {
  await ack();

  try {
    // ワークスペースのユーザーリストを取得
    const usersResult = await client.users.list();
    const activeUsers = usersResult.members
      .filter(user => !user.is_bot && !user.deleted && user.id !== command.user_id)
      .map(user => ({
        text: {
          type: 'plain_text',
          text: user.real_name || user.name
        },
        value: user.id
      }));

    await client.views.open({
      trigger_id: command.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'enhanced_question_form',
        title: {
          type: 'plain_text',
          text: '質問フォーム'
        },
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '📝 質問内容を入力してください'
            }
          },
          {
            type: 'divider'
          },
          // 質問対象者（誰に質問するか）
          {
            type: 'input',
            block_id: 'target_user',
            label: {
              type: 'plain_text',
              text: '質問対象者（この質問に回答してもらいたい人）'
            },
            element: {
              type: 'multi_users_select',
              action_id: 'target_user_select',
              placeholder: {
                type: 'plain_text',
                text: '回答者を選択してください'
              },
              max_selected_items: 5
            }
          },
          // 患者情報セクション
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*📋 患者情報*'
            }
          },
          {
            type: 'input',
            block_id: 'patient_name',
            label: {
              type: 'plain_text',
              text: '患者氏名'
            },
            element: {
              type: 'plain_text_input',
              action_id: 'patient_name_input',
              placeholder: {
                type: 'plain_text',
                text: '山田太郎'
              }
            }
          },
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
                text: 'P-123456'
              }
            }
          },
          {
            type: 'input',
            block_id: 'patient_info',
            label: {
              type: 'plain_text',
              text: '患者の基本情報（年齢、性別、主訴など）'
            },
            optional: true,
            element: {
              type: 'plain_text_input',
              action_id: 'patient_info_input',
              placeholder: {
                type: 'plain_text',
                text: '65歳、男性、糖尿病治療中'
              }
            }
          },
          {
            type: 'divider'
          },
          // 質問詳細セクション
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*💬 質問詳細*'
            }
          },
          {
            type: 'input',
            block_id: 'question_category',
            label: {
              type: 'plain_text',
              text: '質問カテゴリ'
            },
            element: {
              type: 'static_select',
              action_id: 'category_select',
              placeholder: {
                type: 'plain_text',
                text: 'カテゴリを選択'
              },
              options: Object.entries(QUESTION_CATEGORIES).map(([value, text]) => ({
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
            block_id: 'question_title',
            label: {
              type: 'plain_text',
              text: '質問タイトル（簡潔に）'
            },
            element: {
              type: 'plain_text_input',
              action_id: 'title_input',
              placeholder: {
                type: 'plain_text',
                text: '例：インスリン投与量の調整について'
              }
            }
          },
          {
            type: 'input',
            block_id: 'question_detail',
            label: {
              type: 'plain_text',
              text: '質問内容（詳細）'
            },
            element: {
              type: 'plain_text_input',
              action_id: 'detail_input',
              multiline: true,
              placeholder: {
                type: 'plain_text',
                text: '具体的な質問内容を記載してください。\n\n例：\n血糖値が300mg/dlを超えています。\n現在のインスリン投与量は〇〇単位ですが、\n調整が必要でしょうか？'
              }
            }
          },
          {
            type: 'input',
            block_id: 'related_info',
            label: {
              type: 'plain_text',
              text: '関連情報（検査結果、バイタル、既往歴など）'
            },
            optional: true,
            element: {
              type: 'plain_text_input',
              action_id: 'related_info_input',
              multiline: true,
              placeholder: {
                type: 'plain_text',
                text: '質問に関連する追加情報があれば記載してください'
              }
            }
          },
          {
            type: 'input',
            block_id: 'urgency',
            label: {
              type: 'plain_text',
              text: '緊急度'
            },
            element: {
              type: 'static_select',
              action_id: 'urgency_select',
              initial_option: {
                text: { type: 'plain_text', text: '🟡 通常' },
                value: 'normal'
              },
              options: Object.entries(URGENCY_LEVELS).map(([value, text]) => ({
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
            block_id: 'response_deadline',
            label: {
              type: 'plain_text',
              text: '回答希望期限'
            },
            optional: true,
            element: {
              type: 'plain_text_input',
              action_id: 'deadline_input',
              placeholder: {
                type: 'plain_text',
                text: '例：本日17時まで、明日の朝一まで'
              }
            }
          }
        ],
        submit: {
          type: 'plain_text',
          text: '質問を送信'
        },
        close: {
          type: 'plain_text',
          text: 'キャンセル'
        }
      }
    });
  } catch (error) {
    console.error('Error opening modal:', error);
  }
});

// モーダル送信の処理
app.view('enhanced_question_form', async ({ ack, body, view, client }) => {
  await ack();

  const values = view.state.values;
  const userId = body.user.id;
  const questionId = uuidv4();

  // フォームデータを取得
  const targetUsers = values.target_user.target_user_select.selected_users;
  const patientName = values.patient_name.patient_name_input.value;
  const patientId = values.patient_id.patient_id_input.value;
  const patientInfo = values.patient_info?.patient_info_input?.value || '';
  const category = values.question_category.category_select.selected_option.value;
  const title = values.question_title.title_input.value;
  const detail = values.question_detail.detail_input.value;
  const relatedInfo = values.related_info?.related_info_input?.value || '';
  const urgency = values.urgency.urgency_select.selected_option.value;
  const deadline = values.response_deadline?.deadline_input?.value || '';

  // データベースに保存
  const questionData = {
    id: questionId,
    userId: userId,
    type: category,
    title: title,
    details: JSON.stringify({
      targetUsers,
      patientName,
      patientId,
      patientInfo,
      questionDetail: detail,
      relatedInfo,
      deadline
    }),
    urgency: urgency,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  await saveQuestion(questionData);

  // 質問者に確認メッセージ
  await client.chat.postMessage({
    channel: userId,
    text: '質問を送信しました',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '✅ 質問を送信しました'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*質問対象者:* ${targetUsers.map(u => `<@${u}>`).join(', ')}\n*患者:* ${patientName} (${patientId})\n*質問:* ${title}\n*緊急度:* ${URGENCY_LEVELS[urgency]}`
        }
      },
      deadline && {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*回答希望期限:* ${deadline}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `質問ID: \`${questionId}\` | 送信時刻: ${new Date().toLocaleString('ja-JP')}`
          }
        ]
      }
    ].filter(Boolean)
  });

  // 質問対象者に個別に通知
  for (const targetUserId of targetUsers) {
    await client.chat.postMessage({
      channel: targetUserId,
      text: `${patientName}さんについて質問があります`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📮 質問が届いています'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*質問者:* <@${userId}>\n*緊急度:* ${URGENCY_LEVELS[urgency]}${deadline ? `\n*回答期限:* ${deadline}` : ''}`
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*📋 患者情報*\n*氏名:* ${patientName}\n*ID:* ${patientId}${patientInfo ? `\n*基本情報:* ${patientInfo}` : ''}`
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*💬 質問内容*\n*カテゴリ:* ${QUESTION_CATEGORIES[category]}\n*タイトル:* ${title}\n\n*詳細:*\n${detail}`
          }
        },
        relatedInfo && {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*📎 関連情報:*\n${relatedInfo}`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '💬 回答する'
              },
              style: 'primary',
              action_id: 'answer_question',
              value: questionId
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🔄 他の人に転送'
              },
              action_id: 'forward_question',
              value: questionId
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '❓ 詳細を確認'
              },
              action_id: 'request_clarification',
              value: questionId
            }
          ]
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
      ].filter(Boolean)
    });
  }

  // 管理チャンネルにも通知
  if (adminChannelId) {
    await client.chat.postMessage({
      channel: adminChannelId,
      text: '新しい質問が投稿されました',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📊 質問管理ダッシュボード'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*質問者:* <@${userId}>\n*回答対象者:* ${targetUsers.map(u => `<@${u}>`).join(', ')}\n*患者:* ${patientName} (${patientId})\n*カテゴリ:* ${QUESTION_CATEGORIES[category]}\n*緊急度:* ${URGENCY_LEVELS[urgency]}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*質問:* ${title}\n${deadline ? `*回答期限:* ${deadline}` : ''}`
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `質問ID: \`${questionId}\` | ステータス: 未回答`
            }
          ]
        }
      ]
    });
  }
});

// 回答ボタンの処理
app.action('answer_question', async ({ ack, body, client, action }) => {
  await ack();

  const questionId = action.value;

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
              text: '回答を入力してください'
            }
          }
        },
        {
          type: 'input',
          block_id: 'recommendation',
          label: {
            type: 'plain_text',
            text: '推奨事項・アクションプラン'
          },
          optional: true,
          element: {
            type: 'plain_text_input',
            action_id: 'recommendation_input',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: '必要な対応や推奨事項があれば記載してください'
            }
          }
        }
      ],
      submit: {
        type: 'plain_text',
        text: '回答を送信'
      }
    }
  });
});

// 転送ボタンの処理
app.action('forward_question', async ({ ack, body, client, action }) => {
  await ack();

  const questionId = action.value;

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'forward_submission',
      private_metadata: questionId,
      title: {
        type: 'plain_text',
        text: '質問を転送'
      },
      blocks: [
        {
          type: 'input',
          block_id: 'forward_to',
          label: {
            type: 'plain_text',
            text: '転送先を選択'
          },
          element: {
            type: 'multi_users_select',
            action_id: 'forward_users_select',
            placeholder: {
              type: 'plain_text',
              text: '転送先のユーザーを選択'
            },
            max_selected_items: 3
          }
        },
        {
          type: 'input',
          block_id: 'forward_reason',
          label: {
            type: 'plain_text',
            text: '転送理由'
          },
          optional: true,
          element: {
            type: 'plain_text_input',
            action_id: 'reason_input',
            placeholder: {
              type: 'plain_text',
              text: '転送する理由を記載してください'
            }
          }
        }
      ],
      submit: {
        type: 'plain_text',
        text: '転送する'
      }
    }
  });
});

// 統計コマンド
app.command('/question-stats', async ({ command, ack, client }) => {
  await ack();

  try {
    const stats = await getQuestionStats();

    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: '質問統計情報',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📊 質問統計情報'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*総質問数:*\n${stats.total || 0}`
            },
            {
              type: 'mrkdwn',
              text: `*回答済み:*\n${stats.answered || 0}`
            },
            {
              type: 'mrkdwn',
              text: `*未回答:*\n${stats.pending || 0}`
            },
            {
              type: 'mrkdwn',
              text: `*回答率:*\n${stats.answerRate || '0%'}`
            }
          ]
        },
        stats.byCategory && {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*カテゴリ別:*\n' + Object.entries(stats.byCategory)
              .map(([cat, count]) => `• ${QUESTION_CATEGORIES[cat] || cat}: ${count}`)
              .join('\n')
          }
        },
        stats.byUrgency && {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*緊急度別:*\n' + Object.entries(stats.byUrgency)
              .map(([urgency, count]) => `• ${URGENCY_LEVELS[urgency] || urgency}: ${count}`)
              .join('\n')
          }
        }
      ].filter(Boolean)
    });
  } catch (error) {
    console.error('Error getting stats:', error);
  }
});

// アプリケーションの起動
(async () => {
  await app.start();
  console.log('⚡️ 拡張質問管理Bot is running!');
  console.log('Commands:');
  console.log('  /ask - 質問フォーム表示');
  console.log('  /question-stats - 統計情報表示');
})();