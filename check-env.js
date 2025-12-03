require('dotenv').config();

console.log('🔍 環境変数チェック\n');

const required = {
  'SLACK_BOT_TOKEN': process.env.SLACK_BOT_TOKEN,
  'SLACK_SIGNING_SECRET': process.env.SLACK_SIGNING_SECRET,
  'SLACK_APP_TOKEN': process.env.SLACK_APP_TOKEN,
  'ADMIN_CHANNEL_ID': process.env.ADMIN_CHANNEL_ID
};

let allPresent = true;

Object.entries(required).forEach(([key, value]) => {
  if (!value) {
    console.log(`❌ ${key}: 未設定`);
    allPresent = false;
  } else {
    const masked = value.substring(0, 10) + '...';
    console.log(`✅ ${key}: ${masked}`);
  }
});

if (!allPresent) {
  console.log('\n⚠️  必要な環境変数が不足しています。.envファイルを確認してください。');
  process.exit(1);
} else {
  console.log('\n✅ すべての環境変数が設定されています！');
}