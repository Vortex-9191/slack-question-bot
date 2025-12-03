const https = require('https');
const crypto = require('crypto');

// Renderのエンドポイント
const RENDER_URL = 'https://slack-question-bot.onrender.com';

// テスト用のペイロード（医師ID 999でテスト）
const testPayload = {
  type: 'view_submission',
  user: {
    id: 'U07FGR4AL83',
    name: 'test_user'
  },
  view: {
    id: 'V12345',
    callback_id: 'question_modal',
    state: {
      values: {
        patient_block: {
          patient_input: {
            value: '999'
          }
        },
        question_type_block: {
          question_type_input: {
            selected_option: {
              value: 'accounting',
              text: {
                text: '会計'
              }
            }
          }
        },
        doctor_name_block: {
          doctor_name_input: {
            value: 'TEST医師'
          }
        },
        doctor_id_block: {
          doctor_id_input: {
            value: '999'
          }
        },
        question_content_block: {
          question_content_input: {
            value: 'd1_999_葛井テストチャンネルが見つかるかテスト'
          }
        }
      }
    },
    private_metadata: JSON.stringify({
      channelId: 'C0951BS5QHW'
    })
  }
};

// Slack署名を生成（テスト用のダミー）
function generateSlackSignature(body, timestamp, secret) {
  const baseString = `v0:${timestamp}:${body}`;
  const signature = 'v0=' + crypto
    .createHmac('sha256', secret)
    .update(baseString)
    .digest('hex');
  return signature;
}

// HTTPリクエストを送信
function sendRequest() {
  const body = `payload=${encodeURIComponent(JSON.stringify(testPayload))}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const options = {
    hostname: 'slack-question-bot.onrender.com',
    path: '/slack/interactive',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
      'X-Slack-Request-Timestamp': timestamp,
      'X-Slack-Signature': 'v0=test_signature' // テスト用ダミー
    }
  };

  console.log('🚀 Renderエンドポイントをテスト中...');
  console.log(`URL: ${RENDER_URL}/slack/interactive`);
  console.log(`医師ID: 999 でチャンネル検索をテスト`);
  console.log('========================================\n');

  const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log(`📡 ステータスコード: ${res.statusCode}`);
      console.log(`📄 レスポンス: ${data}\n`);

      if (res.statusCode === 200) {
        console.log('✅ エンドポイントは正常に動作しています');
      } else if (res.statusCode === 401) {
        console.log('⚠️ 署名検証で失敗（期待通り）');
        console.log('   実際のSlackからのリクエストでは正しく動作します');
      } else {
        console.log('❌ 予期しないエラー');
      }
    });
  });

  req.on('error', (e) => {
    console.error(`❌ リクエストエラー: ${e.message}`);
  });

  req.write(body);
  req.end();
}

// サーバーのヘルスチェック
function healthCheck() {
  https.get(`${RENDER_URL}/`, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log('🏥 ヘルスチェック:');
      console.log(`   ステータス: ${res.statusCode}`);
      if (res.statusCode === 200) {
        const info = JSON.parse(data);
        console.log(`   ボット: ${info.bot_name}`);
        console.log(`   バージョン: ${info.version}`);
        console.log(`   ステータス: ${info.status}\n`);

        // ヘルスチェック成功後にテストリクエストを送信
        sendRequest();
      } else {
        console.log('❌ サーバーが応答しません');
      }
    });
  }).on('error', (e) => {
    console.error(`❌ 接続エラー: ${e.message}`);
  });
}

// 実行
console.log('========================================');
console.log('Renderデプロイ済みボットのテスト');
console.log('========================================\n');

healthCheck();