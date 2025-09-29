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
    app: '先生質問さん',
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
            private_metadata: JSON.stringify({
              channel_id: req.body.channel_id,
              user_id: user_id
            }),
            title: {
              type: 'plain_text',
              text: '先生質問さん',
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
                    text: '例: 999'
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

    // ボタンアクションの処理
    if (payload.type === 'block_actions') {
      const action = payload.actions[0];

      // 回答ボタン（回答モーダルを表示）
      if (action.action_id === 'modify_question') {
        const data = JSON.parse(action.value);
        console.log('回答ボタンがクリックされました - 回答モーダルを表示');

        try {
          // 回答モーダルを開く（修正・追記用）
          await slackClient.views.open({
            trigger_id: payload.trigger_id,
            view: {
              type: 'modal',
              callback_id: 'modify_answer_submission',
              private_metadata: JSON.stringify({
                ...data,
                modifierId: payload.user.id,
                channelId: payload.channel.id,
                messageTs: payload.message.ts
              }),
              title: {
                type: 'plain_text',
                text: '質問への回答'
              },
              submit: {
                type: 'plain_text',
                text: '回答を送信'
              },
              close: {
                type: 'plain_text',
                text: 'キャンセル'
              },
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `*質問者:* <@${data.userId}>\n*質問タイプ:* ${data.questionType}\n*患者ID:* ${data.patientId}\n*担当医師:* ${data.doctorName}先生`
                  }
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `*質問内容:*\n${data.questionContent}`
                  }
                },
                {
                  type: 'divider'
                },
                {
                  type: 'input',
                  block_id: 'modify_answer_block',
                  label: {
                    type: 'plain_text',
                    text: '回答内容'
                  },
                  element: {
                    type: 'plain_text_input',
                    action_id: 'modify_answer',
                    multiline: true,
                    placeholder: {
                      type: 'plain_text',
                      text: '回答を入力してください'
                    }
                  }
                }
              ]
            }
          });

          return res.status(200).send('');
        } catch (error) {
          console.error('❌ 修正モーダルエラー:', error);
          return res.status(200).send('');
        }
      }

      // 承認ボタン（単純な承認通知）
      if (action.action_id === 'approve_question') {
        const data = JSON.parse(action.value);
        console.log('承認ボタンがクリックされました');

        try {
          // 1. 元のチャンネルのスレッドに承認通知を送信
          if (data.originalChannelId && data.originalMessageTs) {
            await slackClient.chat.postMessage({
              channel: data.originalChannelId,
              thread_ts: data.originalMessageTs,
              text: `<@${data.userId}> 医師が質問を承認しました`,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `✅ <@${data.userId}> 医師が質問を承認しました`
                  }
                },
                {
                  type: 'context',
                  elements: [
                    {
                      type: 'mrkdwn',
                      text: `承認者: ${data.doctorName}先生 | ${new Date().toLocaleString('ja-JP')}`
                    }
                  ]
                }
              ]
            });
          }

          // 2. 質問者にDMでも通知
          await slackClient.chat.postMessage({
            channel: data.userId,
            text: '医師が質問を承認しました',
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: '✅ 質問が承認されました'
                }
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `${data.doctorName}先生（ID: ${data.doctorId}）が質問を承認しました。`
                }
              }
            ]
          });

          // 3. 医師チャンネルのボタンを無効化
          const originalBlocks = payload.message.blocks.map(block => {
            if (block.type === 'actions') {
              block.elements = block.elements.map(element => {
                if (element.action_id === 'approve_question') {
                  element.text.text = '✅ 承認済み';
                  element.style = undefined;
                }
                return element;
              });
            }
            return block;
          });

          await slackClient.chat.update({
            channel: payload.channel.id,
            ts: payload.message.ts,
            blocks: originalBlocks
          });

          // 4. リアクションを追加
          await slackClient.reactions.add({
            name: 'white_check_mark',
            channel: payload.channel.id,
            timestamp: payload.message.ts
          });

          return res.status(200).send('');
        } catch (error) {
          console.error('❌ 承認エラー:', error);
          return res.status(200).send('');
        }
      }

      return res.status(200).send('');
    }

    // 修正・追記モーダルの送信処理（回答として処理）
    if (payload.type === 'view_submission' && payload.view.callback_id === 'modify_answer_submission') {
      const originalData = JSON.parse(payload.view.private_metadata);
      const answerContent = payload.view.state.values.modify_answer_block.modify_answer.value;

      console.log('修正・追記の回答を処理中...');

      // モーダルを閉じる
      res.status(200).json({
        response_action: 'clear'
      });

      try {
        // 1. 元のチャンネルのスレッドに回答を送信（質問者にメンション）
        if (originalData.originalChannelId && originalData.originalMessageTs) {
          await slackClient.chat.postMessage({
            channel: originalData.originalChannelId,
            thread_ts: originalData.originalMessageTs,
            text: `<@${originalData.userId}> 医師から回答がありました`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `✅ <@${originalData.userId}> 医師から回答がありました`
                }
              },
              {
                type: 'divider'
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*回答:*\n${answerContent}`
                }
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `回答者: ${originalData.doctorName}先生 | ${new Date().toLocaleString('ja-JP')}`
                  }
                ]
              }
            ]
          });
        }

        // 2. 質問者にDMでも回答を送信
        await slackClient.chat.postMessage({
          channel: originalData.userId,
          text: '医師から質問への回答がありました',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '医師から回答がありました'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*質問内容:*\n${originalData.questionContent}`
              }
            },
            {
              type: 'divider'
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*回答:*\n${answerContent}`
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `回答者: ${originalData.doctorName}先生 | ${new Date().toLocaleString('ja-JP')}`
                }
              ]
            }
          ]
        });

        // 3. 医師チャンネルのボタンを無効化
        const originalBlocks = await slackClient.conversations.history({
          channel: originalData.channelId,
          latest: originalData.messageTs,
          inclusive: true,
          limit: 1
        });

        if (originalBlocks.messages && originalBlocks.messages.length > 0) {
          const updatedBlocks = originalBlocks.messages[0].blocks.map(block => {
            if (block.type === 'actions') {
              block.elements = block.elements.map(element => {
                if (element.action_id === 'modify_question') {
                  element.text.text = '✅ 回答済み';
                  element.style = undefined;
                }
                return element;
              });
            }
            return block;
          });

          await slackClient.chat.update({
            channel: originalData.channelId,
            ts: originalData.messageTs,
            blocks: updatedBlocks
          });
        }

        // 4. リアクションを追加
        await slackClient.reactions.add({
          name: 'pencil2',
          channel: originalData.channelId,
          timestamp: originalData.messageTs
        });

      } catch (error) {
        console.error('❌ 修正・追記回答送信エラー:', error);
      }

      return;
    }


    if (payload.type === 'view_submission') {
      console.log('📋 フォーム送信処理...');

      const values = payload.view.state.values;

      // metadataからチャンネルIDを取得
      const metadata = JSON.parse(payload.view.private_metadata || '{}');
      const originalChannelId = metadata.channel_id;

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
        timestamp: new Date().toISOString(),
        originalChannelId: originalChannelId
      };


      console.log('フォームデータ:', {
        ...formData,
        questionContent: formData.questionContent.substring(0, 50) + '...'
      });

      // モーダルを閉じる
      res.status(200).json({
        response_action: 'clear'
      });


      // 既存のチャンネル確認処理
      if (originalChannelId) {
        try {
          // まずチャンネル情報を確認
          try {
            const channelInfo = await slackClient.conversations.info({
              channel: originalChannelId
            });
            console.log(`チャンネル確認: ${channelInfo.channel.name} (${originalChannelId})`);
          } catch (infoError) {
            console.log(`チャンネル情報取得エラー: ${originalChannelId}`, infoError.data);
            // ボットをチャンネルに招待する必要があるかもしれません
            if (infoError.data?.error === 'not_in_channel') {
              console.log('ボットがチャンネルに参加していません。');
              // パブリックチャンネルの場合は参加を試みる
              try {
                await slackClient.conversations.join({
                  channel: originalChannelId
                });
                console.log('チャンネルに参加しました');
              } catch (joinError) {
                console.log('チャンネルへの参加に失敗。DMで送信します。');
                originalChannelId = payload.user.id; // DMにフォールバック
              }
            } else if (infoError.data?.error === 'channel_not_found') {
              console.log('チャンネルが見つかりません。DMで送信します。');
              originalChannelId = payload.user.id; // DMにフォールバック
            }
          }

          // 元のチャンネルへメッセージ送信
          const originalMessage = await slackClient.chat.postMessage({
            channel: originalChannelId,
            text: `<@${payload.user.id}> さんが質問を送信しました`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `<@${payload.user.id}> さんが質問を送信しました`
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
                  text: `*担当医師:*\n${formData.doctorName}先生`
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
          console.log('✅ チャンネルへの確認メッセージ送信完了');
        } catch (error) {
          console.error('❌ チャンネルへのメッセージ送信エラー:', error);

          // エラーの場合はユーザーにDMで通知
          try {
            await slackClient.chat.postMessage({
              channel: payload.user.id,
              text: '質問を受け付けました（DMで通知）',
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: '質問を受け付けました。\n※チャンネルへの投稿に失敗したため、DMで通知しています。'
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
                }
              ]
            });
            console.log('DMでの通知送信完了');
          } catch (dmError) {
            console.error('DMでの通知も失敗:', dmError);
          }
        }
      }

      // 医師チャンネルへの直接通知
      let doctorChannel = null;
      let cursor;

      // 医師IDから対応するチャンネルを検索
      try {
        console.log(`\n=======================================`);
        console.log(`🔍 医師ID "${formData.doctorId}" のチャンネルを検索中...`);
        console.log(`=======================================`);

        // まず参加しているチャンネルのみを取得
        let allChannels = [];
        let totalChannelsScanned = 0;

        do {
          const result = await slackClient.conversations.list({
            types: 'public_channel,private_channel',
            limit: 1000,
            cursor
          });

          totalChannelsScanned += result.channels.length;

          allChannels = allChannels.concat(result.channels);

          // デバッグ: すべてのチャンネル名を表示（最初の10個）
          if (result.channels.length > 0 && totalChannelsScanned <= 10) {
            console.log(`スキャンしたチャンネル (最初の${result.channels.length}個):`);
            result.channels.slice(0, 10).forEach(c => {
              console.log(`  - ${c.name} (is_member: ${c.is_member})`);
            });
          }

          // デバッグ: 医師IDを含むチャンネルをすべて表示
          const relatedChannels = result.channels.filter(c =>
            c.name.includes(formData.doctorId)
          );

          if (relatedChannels.length > 0) {
            console.log(`\n✨ 医師ID "${formData.doctorId}" を含むチャンネル発見:`);
            relatedChannels.forEach(c => {
              console.log(`  - ${c.name} (ID: ${c.id}, is_member: ${c.is_member})`);
            });
          }

          cursor = result.response_metadata?.next_cursor;
        } while (cursor);

        console.log(`\n📊 検索結果:`);
        console.log(`  総チャンネル数: ${allChannels.length}`);
        console.log(`  検索する医師ID: "${formData.doctorId}"`);

        // デバッグ: 999を含む全チャンネルを表示
        const channels999All = allChannels.filter(c => c.name.includes('999'));
        if (channels999All.length > 0) {
          console.log('\n🔍 "999"を含むすべてのチャンネル:');
          channels999All.forEach(c => {
            console.log(`  - ${c.name} (Private: ${c.is_private}, Member: ${c.is_member}, Archived: ${c.is_archived})`);
          });
        } else {
          console.log('\n❌ "999"を含むチャンネルが1つも見つかりません');
        }

        // d1_999 形式のチャンネルを特別にチェック
        const specialCheck = allChannels.filter(c =>
          c.name.startsWith('d1_') || c.name.startsWith('d_')
        );
        if (specialCheck.length > 0) {
          console.log(`\n医師チャンネル候補 (d1_ または d_ で始まる):`);
          specialCheck.forEach(c => {
            console.log(`  - ${c.name} (is_member: ${c.is_member})`);
          });
        }

        // 複数のパターンで検索（日本語を含むチャンネル名にも対応）
        // document-confirmation-botと完全に同じ検索方法を使用
        doctorChannel = allChannels.find(c =>
          c.name.match(new RegExp(`^d\\d+_${formData.doctorId}_`))
        );

        if (doctorChannel) {
          console.log(`\n🎯 正規表現 ^d\\d+_${formData.doctorId}_ でマッチ: ${doctorChannel.name}`);
        } else {
          console.log(`\n❌ 正規表現 ^d\\d+_${formData.doctorId}_ にマッチするチャンネルなし`);
        }

        // デバッグ：すべてのd1_999パターンを表示
        const d1_999_channels = allChannels.filter(c =>
          c.name.startsWith('d1_999') || c.name.startsWith('d_999')
        );
        if (d1_999_channels.length > 0) {
          console.log('\n🔍 999関連のdチャンネル:');
          d1_999_channels.forEach(c => {
            console.log(`  - ${c.name} (Private: ${c.is_private}, Member: ${c.is_member}, Archived: ${c.is_archived})`);
          });
        }

        // 見つからない場合は999_infoを探す（フォールバック）
        if (!doctorChannel) {
          doctorChannel = allChannels.find(c => c.name === `${formData.doctorId}_info`);
          if (doctorChannel) {
            console.log(`\n💡 フォールバック: ${formData.doctorId}_info チャンネルを使用`);
          } else {
            console.log(`\n❌ ${formData.doctorId}_info チャンネルも見つかりません`);
          }
        }

        // 医師チャンネルが見つかった場合、そこに通知
        if (doctorChannel) {
          console.log(`✅ 医師チャンネル発見: ${doctorChannel.name} (${doctorChannel.id})`);

          // チャンネルが見つかったら直接送信（document-confirmation-botと同じ方式）
          try {
            await slackClient.chat.postMessage({
              channel: doctorChannel.id,
              text: '新しい質問が届きました',
              blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: '質問が届きました'
                }
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*質問者:* <@${payload.user.id}>`
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
                type: 'divider'
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '回答をお願いします。'
                }
              },
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: {
                      type: 'plain_text',
                      text: '回答する'
                    },
                    style: 'danger',
                    action_id: 'modify_question',
                    value: JSON.stringify({
                      questionId: `${formData.userId}_${Date.now()}`,
                      patientId: formData.patientId,
                      questionType: formData.questionType,
                      questionTypeLabel: formData.questionTypeLabel,
                      doctorName: formData.doctorName,
                      doctorId: formData.doctorId,
                      questionContent: formData.questionContent,
                      userId: formData.userId,
                      originalChannelId: formData.originalChannelId,
                      doctorChannelId: doctorChannel.id,
                      originalMessageTs: originalMessage.ts
                    })
                  },
                  {
                    type: 'button',
                    text: {
                      type: 'plain_text',
                      text: '承認する'
                    },
                    style: 'primary',
                    action_id: 'approve_question',
                    value: JSON.stringify({
                      questionId: `${formData.userId}_${Date.now()}`,
                      patientId: formData.patientId,
                      questionType: formData.questionType,
                      questionTypeLabel: formData.questionTypeLabel,
                      doctorName: formData.doctorName,
                      doctorId: formData.doctorId,
                      questionContent: formData.questionContent,
                      userId: formData.userId,
                      originalChannelId: formData.originalChannelId,
                      doctorChannelId: doctorChannel.id,
                      originalMessageTs: originalMessage.ts
                    })
                  }
                ]
              }
            ]
            });
            console.log('✅ 医師チャンネルへの通知送信完了');
          } catch (sendError) {
            console.error(`❌ 医師チャンネルへの送信エラー:`, sendError);
            console.error('  詳細:', JSON.stringify(sendError.data || sendError, null, 2));

            // エラーの種類に応じて処理
            if (sendError.data?.error === 'not_in_channel') {
              // ボットがチャンネルにいない場合
              console.log('⚠️ ボットがチャンネルのメンバーではありません');

              // パブリックチャンネルなら参加を試みる
              if (!doctorChannel.is_private) {
                try {
                  console.log('チャンネルへの参加を試みます...');
                  await slackClient.conversations.join({
                    channel: doctorChannel.id
                  });

                  // 再度送信
                  await slackClient.chat.postMessage({
                    channel: doctorChannel.id,
                    text: '新しい質問が届きました',
                    blocks: [
                      {
                        type: 'header',
                        text: {
                          type: 'plain_text',
                          text: '質問が届きました'
                        }
                      },
                      {
                        type: 'section',
                        text: {
                          type: 'mrkdwn',
                          text: `*質問者:* <@${payload.user.id}>`
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
                        type: 'divider'
                      },
                      {
                        type: 'section',
                        text: {
                          type: 'mrkdwn',
                          text: '回答をお願いします。'
                        }
                      },
                      {
                        type: 'actions',
                        elements: [
                          {
                            type: 'button',
                            text: {
                              type: 'plain_text',
                              text: '回答する'
                            },
                            style: 'danger',
                            action_id: 'modify_question',
                            value: JSON.stringify({
                              questionId: `${formData.userId}_${Date.now()}`,
                              patientId: formData.patientId,
                              questionType: formData.questionType,
                              questionTypeLabel: formData.questionTypeLabel,
                              doctorName: formData.doctorName,
                              doctorId: formData.doctorId,
                              questionContent: formData.questionContent,
                              userId: formData.userId,
                              originalChannelId: formData.originalChannelId,
                              originalMessageTs: originalMessage.ts,
                              doctorChannelId: doctorChannel.id
                            })
                          },
                          {
                            type: 'button',
                            text: {
                              type: 'plain_text',
                              text: '承認する'
                            },
                            style: 'primary',
                            action_id: 'approve_question',
                            value: JSON.stringify({
                              questionId: `${formData.userId}_${Date.now()}`,
                              patientId: formData.patientId,
                              questionType: formData.questionType,
                              questionTypeLabel: formData.questionTypeLabel,
                              doctorName: formData.doctorName,
                              doctorId: formData.doctorId,
                              questionContent: formData.questionContent,
                              userId: formData.userId,
                              originalChannelId: formData.originalChannelId,
                              originalMessageTs: originalMessage.ts,
                              doctorChannelId: doctorChannel.id
                            })
                          }
                        ]
                      }
                    ]
                  });
                  console.log('✅ 参加後、医師チャンネルへの通知送信完了');
                } catch (joinError) {
                  console.error('❌ チャンネル参加エラー:', joinError.data);
                }
              } else {
                console.log('プライベートチャンネルへは手動で招待する必要があります');
                console.log('Slackで以下を実行してください:');
                console.log(`  /invite @${process.env.BOT_NAME || 'accountingbot'}`);
              }
            } else if (sendError.data?.error === 'channel_not_found') {
              console.error('❌ チャンネルが見つかりません（削除された可能性）');
            } else if (sendError.data?.error === 'is_archived') {
              console.error('❌ チャンネルがアーカイブされています');
            } else {
              console.error('❌ 予期しないエラー:', sendError.data?.error || sendError);
            }
          }
        } else {
          console.log(`⚠️ 医師ID: ${formData.doctorId} に対応するチャンネルが見つかりません`);
          console.log('検索したパターン:');
          console.log(`  - d{数字}_${formData.doctorId}_`);
          console.log(`  - d_${formData.doctorId}_`);
          console.log(`  - doctor_${formData.doctorId}`);
          console.log(`  - ${formData.doctorId}`);
          console.log('\nヒント: チャンネル名が上記のパターンに一致することを確認してください。');
        }
      } catch (error) {
        console.error('❌ 医師チャンネル検索エラー:', error);
      }

      // 管理チャンネルへの通知
      if (adminChannelId && adminChannelId !== '未設定' && adminChannelId !== 'C0951BS5QHW') {
        try {
          // 管理チャンネルの存在確認
          try {
            await slackClient.conversations.info({
              channel: adminChannelId
            });
          } catch (adminError) {
            console.log('管理チャンネルが見つかりません:', adminChannelId);
            return; // 管理チャンネルへの通知をスキップ
          }

          await slackClient.chat.postMessage({
            channel: adminChannelId,
            text: '新しい質問が投稿されました',
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: '新しい質問'
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
  console.log('🚀 先生質問さん v2.0');
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