require('dotenv').config();
const { WebClient } = require('@slack/web-api');

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

async function findChannel() {
  console.log('========================================');
  console.log('d1_999_葛井テスト チャンネル検索');
  console.log('========================================\n');

  try {
    // 認証確認
    const auth = await client.auth.test();
    console.log(`ボット: ${auth.user}`);
    console.log(`チーム: ${auth.team}\n`);

    // 1. アーカイブ済みも含めて検索
    console.log('1. アーカイブ済みチャンネルも含めて検索...');
    let allChannels = [];
    let cursor;

    do {
      const result = await client.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: false,  // アーカイブ済みも含める
        limit: 100,
        cursor
      });
      allChannels = allChannels.concat(result.channels);
      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    console.log(`総チャンネル数: ${allChannels.length}\n`);

    // d1_999で始まるチャンネルを探す
    const channels999 = allChannels.filter(c =>
      c.name.startsWith('d1_999')
    );

    if (channels999.length > 0) {
      console.log('✅ d1_999で始まるチャンネルが見つかりました:');
      channels999.forEach(c => {
        console.log(`\nチャンネル名: ${c.name}`);
        console.log(`  ID: ${c.id}`);
        console.log(`  プライベート: ${c.is_private ? 'Yes' : 'No'}`);
        console.log(`  アーカイブ: ${c.is_archived ? 'Yes' : 'No'}`);
        console.log(`  ボットはメンバー: ${c.is_member ? 'Yes' : 'No'}`);
      });
    } else {
      console.log('❌ d1_999で始まるチャンネルが見つかりません\n');
    }

    // 2. 直接チャンネル情報を取得してみる（チャンネルIDがわかれば）
    console.log('\n2. チャンネル名で部分一致検索...');
    const partialMatches = allChannels.filter(c =>
      c.name.includes('999') || c.name.includes('葛井')
    );

    if (partialMatches.length > 0) {
      console.log('部分一致するチャンネル:');
      partialMatches.forEach(c => {
        console.log(`  - ${c.name} (Private: ${c.is_private}, Member: ${c.is_member}, Archived: ${c.is_archived})`);
      });
    } else {
      console.log('999または葛井を含むチャンネルが見つかりません');
    }

    // 3. ボットがメンバーのプライベートチャンネル数を確認
    const privateChannels = allChannels.filter(c => c.is_private);
    const memberPrivateChannels = privateChannels.filter(c => c.is_member);

    console.log('\n3. プライベートチャンネル統計:');
    console.log(`  見えるプライベートチャンネル総数: ${privateChannels.length}`);
    console.log(`  メンバーのプライベートチャンネル数: ${memberPrivateChannels.length}`);

    if (privateChannels.length === 0) {
      console.log('\n⚠️ プライベートチャンネルが1つも見えません');
      console.log('原因:');
      console.log('  1. groups:read スコープが不足している');
      console.log('  2. ボットがどのプライベートチャンネルにも招待されていない');
    }

    // 4. d1_で始まるチャンネルをすべて表示
    console.log('\n4. d1_で始まるすべてのチャンネル:');
    const d1Channels = allChannels.filter(c => c.name.startsWith('d1_'));
    if (d1Channels.length > 0) {
      d1Channels.forEach(c => {
        console.log(`  - ${c.name} (Private: ${c.is_private}, Member: ${c.is_member})`);
      });
    } else {
      console.log('  d1_で始まるチャンネルが見つかりません');
    }

  } catch (error) {
    if (error.data?.error === 'invalid_auth') {
      console.error('❌ 認証エラー: トークンが無効です');
      console.log('.envファイルのSLACK_BOT_TOKENを確認してください');
    } else {
      console.error('エラー:', error);
    }
  }
}

findChannel();