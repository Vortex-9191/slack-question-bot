require('dotenv').config();

console.log('環境変数チェック:');
console.log('SLACK_BOT_TOKEN:', process.env.SLACK_BOT_TOKEN ? '設定済み' : '未設定');
console.log('SLACK_SIGNING_SECRET:', process.env.SLACK_SIGNING_SECRET ? '設定済み' : '未設定');
console.log('ADMIN_CHANNEL_ID:', process.env.ADMIN_CHANNEL_ID ? '設定済み' : '未設定');

// WebClientのテスト
const { WebClient } = require('@slack/web-api');
const client = new WebClient(process.env.SLACK_BOT_TOKEN);

async function testConnection() {
  try {
    console.log('\nSlack接続テスト中...');
    const result = await client.auth.test();
    console.log('✅ 接続成功!');
    console.log('Bot名:', result.user);
    console.log('チーム:', result.team);
  } catch (error) {
    console.error('❌ 接続失敗:', error.message);
    if (error.data) {
      console.error('エラー詳細:', error.data);
    }
  }
}

testConnection();