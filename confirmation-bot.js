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

// 書類タイプの定義
const DOCUMENT_TYPES = {
  medical_certificate: '診断書',
  prescription: '処方箋',
  referral_letter: '紹介状',
  test_results: '検査結果',
  treatment_plan: '治療計画書',
  consent_form: '同意書',
  insurance_form: '保険書類',
  other: 'その他'
};

// 一時保存データ（本番環境ではRedisやDBを使用）
const tempStorage = new Map();

// ==========================
// スラッシュコマンド
// ==========================

// /request-confirmation - 確認リクエストを作成
app.command('/request-confirmation', async ({ command, ack, client }) => {
  await ack();

  try {
    // セッションIDを生成（一時保存用）
    const sessionId = uuidv4();

    await client.views.open({
      trigger_id: command.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'confirmation_request',
        private_metadata: sessionId,
        title: {
          type: 'plain_text',
          text: '書類確認リクエスト'
        },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*書類確認リクエストフォーム*\n必要事項を入力してください。'
            }
          },
          {
            type: 'divider'
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
                text: '内容を入力する'
              }
            }
          },
          {
            type: 'input',
            block_id: 'document_type',
            label: {
              type: 'plain_text',
              text: '書類タイプ'
            },
            element: {
              type: 'static_select',
              action_id: 'document_type_select',
              placeholder: {
                type: 'plain_text',
                text: 'オプションを選択する'
              },
              options: Object.entries(DOCUMENT_TYPES).map(([value, text]) => ({
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
            type: 'section',
            block_id: 'additional_items',
            text: {
              type: 'mrkdwn',
              text: '*追加確認項目*'
            },
            accessory: {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '項目を追加'
              },
              action_id: 'add_item_button',
              value: sessionId
            }
          },
          {
            type: 'input',
            block_id: 'additional_notes',
            label: {
              type: 'plain_text',
              text: '備考・特記事項'
            },
            optional: true,
            element: {
              type: 'plain_text_input',
              action_id: 'notes_input',
              multiline: true,
              placeholder: {
                type: 'plain_text',
                text: '追加の確認事項や注意点があれば入力してください'
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
                text: { type: 'plain_text', text: '通常' },
                value: 'normal'
              },
              options: [
                {
                  text: { type: 'plain_text', text: '低' },
                  value: 'low'
                },
                {
                  text: { type: 'plain_text', text: '通常' },
                  value: 'normal'
                },
                {
                  text: { type: 'plain_text', text: '高' },
                  value: 'high'
                },
                {
                  text: { type: 'plain_text', text: '緊急' },
                  value: 'urgent'
                }
              ]
            }
          }
        ],
        submit: {
          type: 'plain_text',
          text: '送信'
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

// 項目追加ボタンの処理
app.action('add_item_button', async ({ ack, body, client }) => {
  await ack();

  const sessionId = body.actions[0].value;

  try {
    // 現在のビューを取得
    const currentView = body.view;
    const currentBlocks = [...currentView.blocks];

    // 追加項目のインデックスを計算
    const additionalItemsIndex = currentBlocks.findIndex(
      block => block.block_id === 'additional_items'
    );

    // 既存の追加項目数をカウント
    const existingItems = currentBlocks.filter(
      block => block.block_id && block.block_id.startsWith('custom_item_')
    ).length;

    // 新しい項目を追加
    const newItemBlock = {
      type: 'input',
      block_id: `custom_item_${existingItems + 1}`,
      label: {
        type: 'plain_text',
        text: `確認項目 ${existingItems + 1}`
      },
      element: {
        type: 'plain_text_input',
        action_id: `custom_item_input_${existingItems + 1}`,
        placeholder: {
          type: 'plain_text',
          text: '確認事項を入力してください'
        }
      }
    };

    // 追加項目セクションの後に新しい項目を挿入
    currentBlocks.splice(additionalItemsIndex + 1 + existingItems, 0, newItemBlock);

    // ビューを更新
    await client.views.update({
      view_id: body.view.id,
      view: {
        type: 'modal',
        callback_id: 'confirmation_request',
        private_metadata: sessionId,
        title: {
          type: 'plain_text',
          text: '書類確認リクエスト'
        },
        blocks: currentBlocks,
        submit: {
          type: 'plain_text',
          text: '送信'
        },
        close: {
          type: 'plain_text',
          text: 'キャンセル'
        }
      }
    });
  } catch (error) {
    console.error('Error adding item:', error);
  }
});

// 一時保存ボタンの追加（オプション）
app.shortcut('save_draft', async ({ ack, body, client }) => {
  await ack();

  // 現在のフォームデータを一時保存
  const userId = body.user.id;
  const formData = body.view.state.values;

  tempStorage.set(userId, {
    data: formData,
    timestamp: new Date()
  });

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'draft_saved',
      title: {
        type: 'plain_text',
        text: '一時保存完了'
      },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '✅ フォームの内容を一時保存しました。\n次回フォームを開いた際に復元できます。'
          }
        }
      ],
      close: {
        type: 'plain_text',
        text: '閉じる'
      }
    }
  });
});

// モーダル送信の処理
app.view('confirmation_request', async ({ ack, body, view, client }) => {
  await ack();

  const values = view.state.values;
  const userId = body.user.id;
  const requestId = uuidv4();

  // フォームデータを収集
  const patientId = values.patient_id.patient_id_input.value;
  const documentType = values.document_type.document_type_select.selected_option.value;
  const doctorName = values.doctor_name.doctor_name_input.value;
  const doctorId = values.doctor_id.doctor_id_input.value;
  const notes = values.additional_notes?.notes_input?.value || '';
  const urgency = values.urgency.urgency_select.selected_option.value;

  // カスタム項目を収集
  const customItems = [];
  Object.entries(values).forEach(([blockId, blockValue]) => {
    if (blockId.startsWith('custom_item_')) {
      const inputKey = Object.keys(blockValue)[0];
      if (blockValue[inputKey].value) {
        customItems.push(blockValue[inputKey].value);
      }
    }
  });

  // データベースに保存
  const confirmationRequest = {
    id: requestId,
    userId: userId,
    type: 'document_confirmation',
    title: `${DOCUMENT_TYPES[documentType]}の確認`,
    details: JSON.stringify({
      patientId,
      documentType,
      doctorName,
      doctorId,
      customItems,
      notes
    }),
    urgency: urgency,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  await saveQuestion(confirmationRequest);

  // ユーザーに確認メッセージ
  await client.chat.postMessage({
    channel: userId,
    text: '確認リクエストを受け付けました',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📋 確認リクエスト受付完了'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*患者ID:* ${patientId}\n*書類タイプ:* ${DOCUMENT_TYPES[documentType]}\n*担当医師:* ${doctorName} (${doctorId})\n*緊急度:* ${urgency}`
        }
      },
      customItems.length > 0 && {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*追加確認項目:*\n${customItems.map((item, index) => `${index + 1}. ${item}`).join('\n')}`
        }
      },
      notes && {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*備考:* ${notes}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `リクエストID: \`${requestId}\` | 申請時刻: ${new Date().toLocaleString('ja-JP')}`
          }
        ]
      }
    ].filter(Boolean)
  });

  // 管理チャンネルに承認リクエスト
  if (adminChannelId) {
    await client.chat.postMessage({
      channel: adminChannelId,
      text: '新しい書類確認リクエスト',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📋 書類確認リクエスト'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*申請者:* <@${userId}>\n*患者ID:* ${patientId}\n*書類タイプ:* ${DOCUMENT_TYPES[documentType]}\n*担当医師:* ${doctorName} (${doctorId})\n*緊急度:* ${urgency === 'urgent' ? '🔴' : urgency === 'high' ? '🟠' : urgency === 'normal' ? '🟡' : '🟢'} ${urgency}`
          }
        },
        customItems.length > 0 && {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*確認項目:*\n${customItems.map((item, index) => `☐ ${item}`).join('\n')}`
          }
        },
        notes && {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*備考:* ${notes}`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '✅ 承認'
              },
              style: 'primary',
              action_id: 'approve_confirmation',
              value: requestId
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '❌ 却下'
              },
              style: 'danger',
              action_id: 'reject_confirmation',
              value: requestId
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '💬 詳細確認'
              },
              action_id: 'request_details',
              value: requestId
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '✏️ 修正依頼'
              },
              action_id: 'request_modification',
              value: requestId
            }
          ]
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `リクエストID: \`${requestId}\` | 申請時刻: ${new Date().toLocaleString('ja-JP')}`
            }
          ]
        }
      ].filter(Boolean)
    });
  }

  // 一時保存データをクリア
  tempStorage.delete(view.private_metadata);
});

// 承認ボタンの処理
app.action('approve_confirmation', async ({ ack, body, client, action }) => {
  await ack();

  const requestId = action.value;
  const approverId = body.user.id;

  await updateQuestionStatus(requestId, 'approved');
  await saveApproval({
    questionId: requestId,
    approverId: approverId,
    action: 'approved',
    timestamp: new Date().toISOString()
  });

  // 承認完了のモーダル
  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'approval_confirmation',
      private_metadata: requestId,
      title: {
        type: 'plain_text',
        text: '承認確認'
      },
      blocks: [
        {
          type: 'input',
          block_id: 'approval_comment',
          label: {
            type: 'plain_text',
            text: '承認コメント'
          },
          optional: true,
          element: {
            type: 'plain_text_input',
            action_id: 'comment_input',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: '承認に関するコメントがあれば入力してください'
            }
          }
        }
      ],
      submit: {
        type: 'plain_text',
        text: '承認完了'
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
          text: `✅ *承認済み* - <@${approverId}>が承認しました`
        }
      },
      body.message.blocks[body.message.blocks.length - 1]
    ]
  });
});

// 却下ボタンの処理
app.action('reject_confirmation', async ({ ack, body, client, action }) => {
  await ack();

  const requestId = action.value;
  const rejecterId = body.user.id;

  // 却下理由を入力するモーダル
  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'rejection_reason',
      private_metadata: requestId,
      title: {
        type: 'plain_text',
        text: '却下理由'
      },
      blocks: [
        {
          type: 'input',
          block_id: 'rejection_reason',
          label: {
            type: 'plain_text',
            text: '却下理由を入力してください'
          },
          element: {
            type: 'plain_text_input',
            action_id: 'reason_input',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: '却下の理由を詳しく記載してください'
            }
          }
        }
      ],
      submit: {
        type: 'plain_text',
        text: '却下する'
      }
    }
  });
});

// 修正依頼ボタンの処理
app.action('request_modification', async ({ ack, body, client, action }) => {
  await ack();

  const requestId = action.value;

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'modification_request',
      private_metadata: requestId,
      title: {
        type: 'plain_text',
        text: '修正依頼'
      },
      blocks: [
        {
          type: 'input',
          block_id: 'modification_details',
          label: {
            type: 'plain_text',
            text: '修正内容'
          },
          element: {
            type: 'plain_text_input',
            action_id: 'modification_input',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: '必要な修正内容を記載してください'
            }
          }
        }
      ],
      submit: {
        type: 'plain_text',
        text: '修正依頼を送信'
      }
    }
  });
});

// 統計コマンド
app.command('/confirmation-stats', async ({ command, ack, client }) => {
  await ack();

  try {
    const stats = await getQuestionStats();

    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: '確認リクエスト統計',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📊 確認リクエスト統計'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*総リクエスト数:*\n${stats.total || 0}`
            },
            {
              type: 'mrkdwn',
              text: `*承認済み:*\n${stats.approved || 0}`
            },
            {
              type: 'mrkdwn',
              text: `*保留中:*\n${stats.pending || 0}`
            },
            {
              type: 'mrkdwn',
              text: `*却下:*\n${stats.rejected || 0}`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*承認率:* ${stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0}%`
          }
        }
      ]
    });
  } catch (error) {
    console.error('Error getting stats:', error);
  }
});

// アプリケーションの起動
(async () => {
  await app.start();
  console.log('⚡️ 書類確認リクエストBot is running!');
  console.log('Commands:');
  console.log('  /request-confirmation - 確認リクエスト作成');
  console.log('  /confirmation-stats - 統計表示');
})();