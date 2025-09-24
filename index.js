require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { WebClient } = require('@slack/web-api');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const adminChannelId = process.env.ADMIN_CHANNEL_ID;

// データベース初期化
const { 
  initDatabase,
  saveQuestion,
  getQuestion,
  updateQuestionStatus,
  saveAnswer,
  getUnansweredQuestions,
  searchQuestions
} = require('./data-storage');

// データベース初期化
initDatabase();

// ==========================
// ヘルスチェック
// ==========================
app.get('/', (req, res) => {
  res.send('Slack Question Bot is running! 🤖');
});

// ==========================
// Slack Events API
// ==========================
app.post('/slack/events', async (req, res) => {
  console.log('Received event:', req.body.type);
  
  // URL Verification
  if (req.body.type === 'url_verification') {
    console.log('URL verification challenge received');
    return res.status(200).send(req.body.challenge);
  }

  // Event処理
  if (req.body.event) {
    const event = req.body.event;
    
    // botのメッセージは無視
    if (event.bot_id) {
      return res.send('');
    }

    // メンション、DM、または許可されたチャンネルでの質問受付
    const allowedChannels = process.env.ALLOWED_CHANNELS?.split(',') || [];
    const isAllowedChannel = allowedChannels.includes(event.channel);
    
    if (event.type === 'app_mention' || 
        (event.type === 'message' && event.channel_type === 'im') ||
        (event.type === 'message' && isAllowedChannel)) {
      
      try {
        // 質問を保存
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
        await slackClient.chat.postMessage({
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

        // 管理チャンネルに通知
        const userInfo = await slackClient.users.info({ user: event.user });
        await slackClient.chat.postMessage({
          channel: adminChannelId,
          text: `新しい質問が届きました`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🆕 *新しい質問が届きました*`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*質問者:* <@${event.user}> (${userInfo.user.real_name})\n*質問:*\n> ${question.text}`
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: '📝 回答する'
                  },
                  style: 'primary',
                  action_id: 'answer_question',
                  value: JSON.stringify({
                    questionId,
                    userId: event.user,
                    channelId: event.channel,
                    messageTs: event.ts
                  })
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: '✅ 解決済みにする'
                  },
                  action_id: 'mark_resolved',
                  value: questionId
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: '🔍 類似の質問を検索'
                  },
                  action_id: 'search_similar',
                  value: question.text
                }
              ]
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `質問ID: \`${questionId}\` | <#${event.channel}>`
                }
              ]
            }
          ]
        });

        return res.send('');
      } catch (error) {
        console.error('Error handling question:', error);
        return res.status(500).send('Error');
      }
    }
  }

  // インタラクティブ（ボタンクリック）処理
  if (req.body.payload) {
    const payload = JSON.parse(req.body.payload);
    
    if (payload.type === 'block_actions') {
      const action = payload.actions[0];
      
      // 回答するボタン
      if (action.action_id === 'answer_question') {
        const data = JSON.parse(action.value);
        
        await slackClient.views.open({
          trigger_id: payload.trigger_id,
          view: {
            type: 'modal',
            callback_id: 'answer_modal',
            private_metadata: JSON.stringify(data),
            title: {
              type: 'plain_text',
              text: '質問に回答'
            },
            submit: {
              type: 'plain_text',
              text: '送信'
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
                  text: `*質問者:* <@${data.userId}>`
                }
              },
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
                    text: '回答を入力してください'
                  }
                }
              },
              {
                type: 'input',
                block_id: 'category_block',
                label: {
                  type: 'plain_text',
                  text: 'カテゴリー'
                },
                optional: true,
                element: {
                  type: 'static_select',
                  action_id: 'category_select',
                  placeholder: {
                    type: 'plain_text',
                    text: 'カテゴリーを選択'
                  },
                  options: [
                    {
                      text: { type: 'plain_text', text: '技術的な質問' },
                      value: 'technical'
                    },
                    {
                      text: { type: 'plain_text', text: '業務に関する質問' },
                      value: 'business'
                    },
                    {
                      text: { type: 'plain_text', text: '手続き・申請' },
                      value: 'procedure'
                    },
                    {
                      text: { type: 'plain_text', text: 'その他' },
                      value: 'other'
                    }
                  ]
                }
              }
            ]
          }
        });
        
        return res.send('');
      }
      
      // 解決済みにする
      if (action.action_id === 'mark_resolved') {
        const questionId = action.value;
        await updateQuestionStatus(questionId, 'resolved');
        
        // メッセージを更新
        await slackClient.chat.update({
          channel: payload.channel.id,
          ts: payload.message.ts,
          text: '✅ 解決済みとしてマークされました',
          blocks: [
            ...payload.message.blocks,
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `✅ *解決済み* - <@${payload.user.id}>により処理されました`
              }
            }
          ]
        });
        
        return res.send('');
      }
    }
    
    // 質問モーダル送信処理
    if (payload.type === 'view_submission' && payload.view.callback_id === 'question_modal') {
      const metadata = JSON.parse(payload.view.private_metadata);
      const state = payload.view.state.values;
      const category = state.category_block.category_select.selected_option.text.text;
      const categoryValue = state.category_block.category_select.selected_option.value;
      const questionText = state.question_block.question_input.value;
      const urgency = state.urgency_block?.urgency_select?.selected_option?.value || 'normal';
      
      // 質問を保存
      const questionId = uuidv4();
      const question = {
        id: questionId,
        userId: metadata.user_id,
        text: questionText,
        channelId: metadata.channel_id,
        messageTs: Date.now().toString(),
        status: 'pending',
        category: categoryValue,
        urgency: urgency
      };
      
      await saveQuestion(question);
      
      // 管理チャンネルに通知
      if (adminChannelId && adminChannelId !== 'C-your-admin-channel-id') {
        try {
          const userInfo = await slackClient.users.info({ user: metadata.user_id });
          const urgencyEmoji = urgency === 'high' ? '🔴' : urgency === 'low' ? '🔵' : '🟡';
          
          await slackClient.chat.postMessage({
            channel: adminChannelId,
            text: `🆕 新しい質問が届きました`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `🆕 *新しい質問が届きました*`
                }
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*質問種別:* ${category} ${urgencyEmoji}\n*質問者:* <@${metadata.user_id}> (${userInfo.user.real_name || 'Unknown'})\n*質問:*\n> ${questionText}`
                }
              },
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: {
                      type: 'plain_text',
                      text: '📝 回答する'
                    },
                    style: 'primary',
                    action_id: 'answer_question',
                    value: JSON.stringify({
                      questionId,
                      userId: metadata.user_id,
                      channelId: metadata.channel_id,
                      messageTs: question.messageTs
                    })
                  }
                ]
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `質問ID: \`${questionId}\` | 種別: ${category} | 緊急度: ${urgency}`
                  }
                ]
              }
            ]
          });
        } catch (error) {
          console.log('管理チャンネルへの通知エラー:', error);
        }
      }
      
      // ユーザーにDMで確認
      try {
        const dmChannel = await slackClient.conversations.open({
          users: metadata.user_id
        });
        
        await slackClient.chat.postMessage({
          channel: dmChannel.channel.id,
          text: `✅ 質問を受け付けました！\n\n*質問種別:* ${category}\n*質問内容:*\n> ${questionText}\n\n担当者から回答があり次第、こちらでお知らせします。\n\n質問ID: \`${questionId}\``
        });
      } catch (error) {
        console.log('DM送信エラー:', error);
      }
      
      return res.json({ response_action: 'clear' });
    }
    
    // 回答モーダル送信処理
    if (payload.type === 'view_submission' && payload.view.callback_id === 'answer_modal') {
      const metadata = JSON.parse(payload.view.private_metadata);
      const state = payload.view.state.values;
      const answer = state.answer_block.answer_input.value;
      const category = state.category_block?.category_select?.selected_option?.value || 'other';
      
      // 回答を保存
      await saveAnswer({
        questionId: metadata.questionId,
        answeredBy: payload.user.id,
        answer: answer,
        category: category
      });
      
      // 質問者に回答を送信
      await slackClient.chat.postMessage({
        channel: metadata.channelId,
        thread_ts: metadata.messageTs,
        text: '回答が届きました',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `💬 *回答が届きました*\n\n${answer}`
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `回答者: <@${payload.user.id}> | カテゴリー: ${category}`
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '_この回答は参考になりましたか？下記のボタンでフィードバックをお願いします。_'
            }
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
                action_id: 'helpful',
                value: metadata.questionId
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '👎 改善が必要'
                },
                action_id: 'needs_improvement',
                value: metadata.questionId
              }
            ]
          }
        ]
      });
      
      // ステータスを更新
      await updateQuestionStatus(metadata.questionId, 'answered');
      
      return res.json({ response_action: 'clear' });
    }
  }
  
  res.send('');
});

// ==========================
// スラッシュコマンド
// ==========================
app.post('/slack/slash-commands', async (req, res) => {
  console.log('Slash command received:', req.body.command);
  const { command, text, user_id, channel_id, trigger_id } = req.body;
  
  try {
    // /question コマンド - 質問を投稿（モーダル表示）
    if (command === '/question') {
      console.log('Question command received, trigger_id:', trigger_id);
      
      // トークンチェック
      if (!process.env.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN === 'xoxb-your-bot-token-here') {
        res.send('⚠️ ボットが正しく設定されていません。管理者に連絡してください。');
        return;
      }
      
      try {
        // 質問入力モーダルを表示
        const modalResult = await slackClient.views.open({
        trigger_id: trigger_id,
        view: {
          type: 'modal',
          callback_id: 'question_modal',
          title: {
            type: 'plain_text',
            text: '質問を投稿'
          },
          submit: {
            type: 'plain_text',
            text: '送信'
          },
          close: {
            type: 'plain_text',
            text: 'キャンセル'
          },
          blocks: [
            {
              type: 'input',
              block_id: 'category_block',
              label: {
                type: 'plain_text',
                text: '質問種別'
              },
              element: {
                type: 'static_select',
                action_id: 'category_select',
                placeholder: {
                  type: 'plain_text',
                  text: '種別を選択してください'
                },
                options: [
                  {
                    text: { type: 'plain_text', text: '会計確認' },
                    value: 'accounting'
                  },
                  {
                    text: { type: 'plain_text', text: '疑義照会' },
                    value: 'inquiry'
                  },
                  {
                    text: { type: 'plain_text', text: 'CS確認' },
                    value: 'cs'
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
                  text: '質問を入力してください'
                }
              }
            },
            {
              type: 'input',
              block_id: 'urgency_block',
              label: {
                type: 'plain_text',
                text: '緊急度'
              },
              optional: true,
              element: {
                type: 'radio_buttons',
                action_id: 'urgency_select',
                initial_option: {
                  text: { type: 'plain_text', text: '通常' },
                  value: 'normal'
                },
                options: [
                  {
                    text: { type: 'plain_text', text: '緊急' },
                    value: 'high'
                  },
                  {
                    text: { type: 'plain_text', text: '通常' },
                    value: 'normal'
                  },
                  {
                    text: { type: 'plain_text', text: '低' },
                    value: 'low'
                  }
                ]
              }
            }
          ],
          private_metadata: JSON.stringify({ 
            channel_id: channel_id,
            user_id: user_id 
          })
        }
      });
      
      console.log('Modal open result:', modalResult);
      res.send(''); // モーダル表示後に空のレスポンスを返す
      return;
    } catch (error) {
      console.error('Error opening modal:', error);
      res.send('⚠️ モーダルを開く際にエラーが発生しました。');
      return;
    }
  }
    
    // /question-stats コマンド
    if (command === '/question-stats') {
      // トークンチェック
      if (!process.env.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN === 'xoxb-your-bot-token-here') {
        res.send('⚠️ ボットトークンが設定されていません。管理者に連絡してください。');
        return;
      }
      
      const unanswered = await getUnansweredQuestions();
      const stats = `📊 *質問統計*\n未回答: ${unanswered.length}件`;
      
      // 即座にレスポンスを返す（3秒以内のSlackタイムアウト対策）
      res.send(stats);
      return;
    }
    
    // デフォルトのヘルプメッセージ
    const helpMessage = `利用可能なコマンド:\n/question - 質問を投稿\n/question-stats - 質問の統計を表示`;
    res.send(helpMessage);
    
  } catch (error) {
    console.error('Slash command error:', error);
    res.status(500).send('コマンド処理中にエラーが発生しました');
  }
});

// ==========================
// サーバー起動
// ==========================
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✨ Slack Question Bot 起動！`);
  console.log(`📡 Port: ${port}`);
  console.log(`🤖 Bot Token: ${process.env.SLACK_BOT_TOKEN ? 'Set' : 'Not set'}`);
  console.log(`📢 Admin Channel: ${adminChannelId || 'Not set'}`);
  console.log('================================');
});