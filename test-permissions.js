require('dotenv').config();
const { WebClient } = require('@slack/web-api');

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

async function testPermissions() {
  console.log('========================================');
  console.log('🔍 Slack Bot 権限テスト');
  console.log('========================================\n');

  // 1. 認証テスト
  console.log('1️⃣ 認証テスト...');
  try {
    const auth = await client.auth.test();
    console.log('✅ 認証成功');
    console.log(`  ボット名: ${auth.user}`);
    console.log(`  ボットID: ${auth.user_id}`);
    console.log(`  チーム: ${auth.team}`);
    console.log(`  チームID: ${auth.team_id}\n`);
  } catch (e) {
    console.log('❌ 認証失敗');
    console.log(`  エラー: ${e.data?.error || e.message}`);
    console.log('\n⚠️  SLACK_BOT_TOKEN が正しくない可能性があります');
    return;
  }

  // 2. 利用可能なスコープを確認
  console.log('2️⃣ 利用可能なスコープ...');
  try {
    const auth = await client.auth.test();
    // スコープ情報は auth.test では取得できないため、別の方法で確認
    console.log('  （スコープ確認にはSlack App管理画面を参照）\n');
  } catch (e) {
    console.log('  スコープ確認エラー\n');
  }

  // 3. チャンネルリスト取得テスト
  console.log('3️⃣ チャンネルリスト取得テスト...');
  try {
    let allChannels = [];
    let cursor;

    do {
      const result = await client.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 100,
        cursor
      });
      allChannels = allChannels.concat(result.channels);
      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    console.log(`✅ チャンネルリスト取得成功`);
    console.log(`  総チャンネル数: ${allChannels.length}\n`);

    // 999を含むチャンネルを探す
    console.log('4️⃣ 医師ID "999" を含むチャンネルを検索...');
    const targetChannels = allChannels.filter(c =>
      c.name.includes('999')
    );

    if (targetChannels.length > 0) {
      console.log(`✅ ${targetChannels.length}個のチャンネルが見つかりました:\n`);
      targetChannels.forEach(channel => {
        console.log(`  📌 ${channel.name}`);
        console.log(`     ID: ${channel.id}`);
        console.log(`     タイプ: ${channel.is_private ? '🔒 プライベート' : '# パブリック'}`);
        console.log(`     ボットはメンバー: ${channel.is_member ? '✅ Yes' : '❌ No'}`);
        console.log(`     アーカイブ: ${channel.is_archived ? 'Yes' : 'No'}\n`);

        if (!channel.is_member) {
          console.log(`     ⚠️  ボットをチャンネルに追加してください:`);
          console.log(`        Slackで実行: /invite @${process.env.BOT_NAME || 'your-bot'}\n`);
        }
      });
    } else {
      console.log('⚠️  "999" を含むチャンネルが見つかりません\n');

      // d1_ または d_ で始まるチャンネルを探す
      const doctorChannels = allChannels.filter(c =>
        c.name.startsWith('d1_') || c.name.startsWith('d_')
      );

      if (doctorChannels.length > 0) {
        console.log('💡 医師チャンネル候補 (d1_ または d_ で始まる):');
        doctorChannels.forEach(c => {
          console.log(`  - ${c.name} (メンバー: ${c.is_member ? 'Yes' : 'No'})`);
        });
      }
    }

    // チャンネル名の一覧（最初の20個）
    console.log('\n5️⃣ すべてのチャンネル（最初の20個）:');
    allChannels.slice(0, 20).forEach(c => {
      const memberStatus = c.is_member ? '✅' : '  ';
      const typeIcon = c.is_private ? '🔒' : '#';
      console.log(`  ${memberStatus} ${typeIcon} ${c.name}`);
    });

  } catch (e) {
    console.log('❌ チャンネルリスト取得失敗');
    console.log(`  エラー: ${e.data?.error || e.message}`);

    if (e.data?.error === 'missing_scope') {
      console.log('\n⚠️  必要なスコープが不足しています');
      console.log('  以下のスコープを追加してください:');
      console.log('  - channels:read (パブリックチャンネル用)');
      console.log('  - groups:read (プライベートチャンネル用)');
    }
  }

  // 6. メッセージ送信テスト
  console.log('\n6️⃣ メッセージ送信テスト...');
  try {
    const auth = await client.auth.test();
    await client.chat.postMessage({
      channel: auth.user_id,
      text: '✅ テストメッセージ: 権限確認OK',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '✅ *権限テスト完了*\nボットは正常に動作しています。'
          }
        }
      ]
    });
    console.log('✅ メッセージ送信成功（DMに送信しました）');
  } catch (e) {
    console.log('❌ メッセージ送信失敗');
    console.log(`  エラー: ${e.data?.error || e.message}`);

    if (e.data?.error === 'missing_scope') {
      console.log('\n⚠️  chat:write スコープが不足しています');
    }
  }

  console.log('\n========================================');
  console.log('テスト完了');
  console.log('========================================');
}

// 実行
testPermissions().catch(console.error);