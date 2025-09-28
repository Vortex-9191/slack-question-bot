require('dotenv').config();
const { WebClient } = require('@slack/web-api');

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

async function joinAllChannels() {
  console.log('🤖 ボットをすべてのパブリックチャンネルに参加させます...\n');

  try {
    // ボット情報を取得
    const authInfo = await slackClient.auth.test();
    console.log(`ボット名: ${authInfo.user}`);
    console.log(`ボットID: ${authInfo.user_id}\n`);

    // すべてのパブリックチャンネルを取得
    let cursor;
    let allChannels = [];

    do {
      const result = await slackClient.conversations.list({
        types: 'public_channel',
        limit: 1000,
        cursor
      });

      allChannels = allChannels.concat(result.channels);
      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    console.log(`見つかったパブリックチャンネル: ${allChannels.length}個\n`);

    // 各チャンネルに参加を試みる
    let joinedCount = 0;
    let alreadyInCount = 0;
    let failedCount = 0;

    for (const channel of allChannels) {
      try {
        // チャンネル情報を取得
        const info = await slackClient.conversations.info({
          channel: channel.id
        });

        if (info.channel.is_member) {
          console.log(`✓ 既に参加: #${channel.name}`);
          alreadyInCount++;
        } else {
          // チャンネルに参加
          await slackClient.conversations.join({
            channel: channel.id
          });
          console.log(`✅ 参加成功: #${channel.name}`);
          joinedCount++;
        }
      } catch (error) {
        if (error.data?.error === 'already_in_channel') {
          console.log(`✓ 既に参加: #${channel.name}`);
          alreadyInCount++;
        } else if (error.data?.error === 'is_archived') {
          console.log(`⚠️  アーカイブ済み: #${channel.name}`);
        } else {
          console.log(`❌ 参加失敗: #${channel.name} - ${error.data?.error || error.message}`);
          failedCount++;
        }
      }

      // レート制限を避けるため少し待機
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n========== 結果 ==========');
    console.log(`新規参加: ${joinedCount}個`);
    console.log(`既に参加: ${alreadyInCount}個`);
    console.log(`失敗: ${failedCount}個`);
    console.log('==========================\n');

    // 医師チャンネルを探す
    console.log('🔍 医師チャンネルを探しています...\n');
    const doctorChannels = allChannels.filter(c =>
      c.name.match(/^d\d+_/) ||
      c.name.match(/^d_/) ||
      c.name.match(/^doctor_/) ||
      c.name.match(/^\d{3}/) // 3桁の数字で始まる
    );

    if (doctorChannels.length > 0) {
      console.log('見つかった医師チャンネル:');
      doctorChannels.forEach(c => {
        console.log(`  - #${c.name} (${c.id})`);
      });
    } else {
      console.log('医師チャンネルが見つかりませんでした。');
      console.log('チャンネル名が以下のパターンに一致することを確認してください:');
      console.log('  - d{番号}_{医師ID}_');
      console.log('  - d_{医師ID}_');
      console.log('  - doctor_{医師ID}');
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  }
}

// 特定のチャンネルに参加
async function joinSpecificChannel(channelName) {
  try {
    console.log(`🔍 チャンネル "${channelName}" を検索中...`);

    const result = await slackClient.conversations.list({
      types: 'public_channel,private_channel',
      limit: 1000
    });

    const channel = result.channels.find(c => c.name === channelName);

    if (channel) {
      console.log(`✅ チャンネル発見: #${channel.name} (${channel.id})`);

      await slackClient.conversations.join({
        channel: channel.id
      });

      console.log(`✅ チャンネルに参加しました: #${channel.name}`);
    } else {
      console.log(`❌ チャンネル "${channelName}" が見つかりません`);
    }
  } catch (error) {
    console.error('エラー:', error.data || error);
  }
}

// コマンドライン引数を確認
const args = process.argv.slice(2);

if (args.length > 0) {
  // 特定のチャンネルに参加
  joinSpecificChannel(args[0]);
} else {
  // すべてのチャンネルに参加
  joinAllChannels();
}