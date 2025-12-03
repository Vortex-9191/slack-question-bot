// このスクリプトは、document-confirmation-botが本当にd1_999_葛井テストを見つけられるか検証します
// document-confirmation-botと全く同じ方法で検索を実行

require('dotenv').config();
const { WebClient } = require('@slack/web-api');

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

async function testDoctorChannelSearch() {
  console.log('========================================');
  console.log('document-confirmation-bot方式でのチャンネル検索テスト');
  console.log('========================================\n');

  try {
    // 認証確認
    const auth = await client.auth.test();
    console.log(`ボット: ${auth.user} (${auth.user_id})`);
    console.log(`チーム: ${auth.team}\n`);

    // document-confirmation-botと完全に同じ検索ロジック
    const doctorId = '999';
    let doctorChannel = null;
    let cursor;
    let allChannels = [];
    let iterationCount = 0;

    console.log('document-confirmation-botと同じ方法で検索中...\n');

    do {
      iterationCount++;
      console.log(`検索イテレーション ${iterationCount}...`);

      const result = await client.conversations.list({
        types: 'public_channel,private_channel',
        limit: 1000,
        cursor
      });

      console.log(`  取得チャンネル数: ${result.channels.length}`);
      allChannels = allChannels.concat(result.channels);

      // document-confirmation-botと同じ正規表現
      doctorChannel = result.channels.find(c =>
        c.name.match(new RegExp(`^d\\d+_${doctorId}_`))
      );

      if (doctorChannel) {
        console.log(`\n✅ 見つかりました！`);
        break;
      }

      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    console.log(`\n総チャンネル数: ${allChannels.length}`);

    if (doctorChannel) {
      console.log('\n🎯 document-confirmation-bot方式で見つかったチャンネル:');
      console.log(`  名前: ${doctorChannel.name}`);
      console.log(`  ID: ${doctorChannel.id}`);
      console.log(`  プライベート: ${doctorChannel.is_private}`);
      console.log(`  メンバー: ${doctorChannel.is_member}`);
      console.log(`  アーカイブ: ${doctorChannel.is_archived}`);
    } else {
      console.log('\n❌ 正規表現 ^d\\d+_999_ にマッチするチャンネルが見つかりません');
    }

    // d1_999で始まるチャンネルをすべて表示
    const d1_999_channels = allChannels.filter(c =>
      c.name.startsWith('d1_999')
    );

    console.log('\n📋 d1_999で始まるすべてのチャンネル:');
    if (d1_999_channels.length > 0) {
      d1_999_channels.forEach(c => {
        console.log(`  - ${c.name}`);
        console.log(`    ID: ${c.id}`);
        console.log(`    Private: ${c.is_private}, Member: ${c.is_member}, Archived: ${c.is_archived}`);
      });
    } else {
      console.log('  なし');
    }

    // 999を含むすべてのチャンネル
    const channels999 = allChannels.filter(c => c.name.includes('999'));
    console.log('\n📋 "999"を含むすべてのチャンネル:');
    if (channels999.length > 0) {
      channels999.forEach(c => {
        console.log(`  - ${c.name} (Private: ${c.is_private}, Member: ${c.is_member})`);
      });
    } else {
      console.log('  なし');
    }

    // プライベートチャンネルの統計
    const privateChannels = allChannels.filter(c => c.is_private);
    const memberPrivateChannels = privateChannels.filter(c => c.is_member);

    console.log('\n📊 プライベートチャンネル統計:');
    console.log(`  総プライベートチャンネル数: ${privateChannels.length}`);
    console.log(`  メンバーのプライベートチャンネル数: ${memberPrivateChannels.length}`);

    if (memberPrivateChannels.length > 0) {
      console.log('\n  メンバーになっているプライベートチャンネル:');
      memberPrivateChannels.forEach(c => {
        console.log(`    - ${c.name}`);
      });
    }

    // ボット自身の情報を取得
    console.log('\n🤖 ボット情報:');
    console.log(`  ボット名: ${auth.user}`);
    console.log(`  ボットID: ${auth.user_id}`);
    console.log(`  チームID: ${auth.team_id}`);

  } catch (error) {
    if (error.data?.error === 'invalid_auth') {
      console.error('❌ 認証エラー: トークンが無効です');
    } else {
      console.error('エラー:', error.data || error);
    }
  }
}

testDoctorChannelSearch();