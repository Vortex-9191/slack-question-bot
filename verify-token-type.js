// このスクリプトはトークンの種類と権限を確認します

require('dotenv').config();
const { WebClient } = require('@slack/web-api');

async function analyzeToken() {
  const token = process.env.SLACK_BOT_TOKEN;

  if (!token || token === 'xoxb-your-bot-token') {
    console.error('❌ 有効なトークンが設定されていません');
    console.log('Renderの環境変数から実際のトークンを取得してください');
    return;
  }

  console.log('========================================');
  console.log('Slackトークン分析');
  console.log('========================================\n');

  // トークンの種類を判定
  console.log('1. トークンタイプ:');
  if (token.startsWith('xoxb-')) {
    console.log('  ✅ Bot Token (xoxb-)');
    console.log('  説明: ボットユーザーとして動作');
  } else if (token.startsWith('xoxp-')) {
    console.log('  ⚠️ User Token (xoxp-)');
    console.log('  説明: ユーザーの権限で動作');
  } else if (token.startsWith('xoxe-')) {
    console.log('  📱 User Token (xoxe-)');
    console.log('  説明: ユーザーの権限で動作（新形式）');
  } else {
    console.log('  ❓ 不明なトークンタイプ');
  }

  const client = new WebClient(token);

  try {
    // 認証情報を取得
    const auth = await client.auth.test();

    console.log('\n2. 認証情報:');
    console.log(`  ユーザー/ボット名: ${auth.user}`);
    console.log(`  ID: ${auth.user_id}`);
    console.log(`  チーム: ${auth.team}`);
    console.log(`  チームID: ${auth.team_id}`);
    console.log(`  ボットですか: ${auth.is_bot ? 'はい' : 'いいえ'}`);

    // プライベートチャンネルへのアクセステスト
    console.log('\n3. プライベートチャンネルアクセステスト:');

    let privateChannelCount = 0;
    let memberPrivateChannelCount = 0;
    let cursor;

    do {
      const result = await client.conversations.list({
        types: 'private_channel',
        limit: 100,
        cursor
      });

      privateChannelCount += result.channels.length;
      memberPrivateChannelCount += result.channels.filter(c => c.is_member).length;

      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    console.log(`  見えるプライベートチャンネル数: ${privateChannelCount}`);
    console.log(`  メンバーのプライベートチャンネル数: ${memberPrivateChannelCount}`);

    if (privateChannelCount === 0) {
      console.log('\n  ⚠️ プライベートチャンネルが1つも見えません');
      console.log('  原因:');
      console.log('    1. groups:read スコープが不足');
      console.log('    2. ボットがどのプライベートチャンネルにも招待されていない');
    } else if (memberPrivateChannelCount === 0) {
      console.log('\n  ⚠️ ボットはプライベートチャンネルのメンバーではありません');
      console.log('  解決方法: /invite @' + auth.user);
    }

    // 999関連チャンネルの検索
    console.log('\n4. 医師ID 999 のチャンネル検索:');

    let allChannels = [];
    cursor = undefined;

    do {
      const result = await client.conversations.list({
        types: 'public_channel,private_channel',
        limit: 100,
        cursor
      });

      allChannels = allChannels.concat(result.channels);
      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    // d1_999_で始まるチャンネル
    const d1_999_channels = allChannels.filter(c =>
      c.name.match(/^d\d+_999_/)
    );

    if (d1_999_channels.length > 0) {
      console.log('  ✅ d{数字}_999_ パターンのチャンネル:');
      d1_999_channels.forEach(c => {
        console.log(`    - ${c.name}`);
        console.log(`      Private: ${c.is_private}, Member: ${c.is_member}`);
      });
    } else {
      console.log('  ❌ d{数字}_999_ パターンのチャンネルが見つかりません');
    }

    // 999_info
    const info999 = allChannels.find(c => c.name === '999_info');
    if (info999) {
      console.log('\n  ✅ 999_info チャンネル:');
      console.log(`    Private: ${info999.is_private}, Member: ${info999.is_member}`);
    }

    // スコープの推定
    console.log('\n5. スコープ分析:');
    if (privateChannelCount > 0) {
      console.log('  ✅ groups:read スコープあり（プライベートチャンネルが見える）');
    } else {
      console.log('  ❌ groups:read スコープなし、またはプライベートチャンネルのメンバーではない');
    }

    if (auth.is_bot) {
      console.log('  ✅ Bot Tokenを使用中');
      console.log('  → ボットがメンバーのチャンネルのみアクセス可能');
    } else {
      console.log('  ⚠️ User Tokenを使用中');
      console.log('  → ユーザーがメンバーのすべてのチャンネルにアクセス可能');
    }

  } catch (error) {
    console.error('\n❌ エラー:', error.data?.error || error.message);

    if (error.data?.error === 'missing_scope') {
      console.log('\n必要なスコープ:');
      console.log('  - channels:read');
      console.log('  - groups:read');
    }
  }

  console.log('\n========================================');
  console.log('分析完了');
  console.log('========================================');
}

analyzeToken();