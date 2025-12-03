require('dotenv').config();
const { WebClient } = require('@slack/web-api');

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

async function checkOAuthScopes() {
  console.log('========================================');
  console.log('OAuth Scopes チェック');
  console.log('========================================\n');

  try {
    // トークン情報を取得（Slack API v2メソッド）
    const authInfo = await client.auth.test();
    console.log('認証情報:');
    console.log(`  ボット名: ${authInfo.user}`);
    console.log(`  ボットID: ${authInfo.user_id}`);
    console.log(`  チーム: ${authInfo.team}`);
    console.log(`  URL: ${authInfo.url}\n`);

    // 実際のAPI呼び出しでスコープをテスト
    console.log('スコープテスト結果:\n');

    // 1. channels:read テスト
    try {
      await client.conversations.list({
        types: 'public_channel',
        limit: 1
      });
      console.log('✅ channels:read - パブリックチャンネル読み取り可能');
    } catch (e) {
      console.log(`❌ channels:read - エラー: ${e.data?.error}`);
    }

    // 2. groups:read テスト（プライベートチャンネル）
    try {
      await client.conversations.list({
        types: 'private_channel',
        limit: 1
      });
      console.log('✅ groups:read - プライベートチャンネル読み取り可能');
    } catch (e) {
      console.log(`❌ groups:read - エラー: ${e.data?.error}`);
      if (e.data?.error === 'missing_scope') {
        console.log('   ⚠️  groups:read スコープが不足しています！');
      }
    }

    // 3. 両方同時にテスト
    try {
      const result = await client.conversations.list({
        types: 'public_channel,private_channel',
        limit: 10
      });
      console.log(`✅ conversations.list - 合計 ${result.channels.length} チャンネル取得可能`);

      const publicChannels = result.channels.filter(c => !c.is_private);
      const privateChannels = result.channels.filter(c => c.is_private);

      console.log(`   パブリック: ${publicChannels.length}個`);
      console.log(`   プライベート: ${privateChannels.length}個`);

      if (privateChannels.length === 0) {
        console.log('   ⚠️  プライベートチャンネルが0個です - groups:read スコープ不足の可能性');
      }
    } catch (e) {
      console.log(`❌ conversations.list (両方) - エラー: ${e.data?.error}`);
    }

    // 4. チャンネル参加テスト
    try {
      // テスト用のパブリックチャンネルで試す
      const testResult = await client.conversations.list({
        types: 'public_channel',
        limit: 1
      });

      if (testResult.channels.length > 0) {
        const testChannel = testResult.channels[0];
        if (!testChannel.is_member) {
          await client.conversations.join({
            channel: testChannel.id
          });
          console.log('✅ channels:join - チャンネル参加可能');
        } else {
          console.log('✅ channels:join - テスト済み（既にメンバー）');
        }
      }
    } catch (e) {
      console.log(`❌ channels:join - エラー: ${e.data?.error}`);
    }

    // 5. メッセージ送信テスト
    try {
      await client.chat.postMessage({
        channel: authInfo.user_id,
        text: 'スコープテスト完了'
      });
      console.log('✅ chat:write - メッセージ送信可能');
    } catch (e) {
      console.log(`❌ chat:write - エラー: ${e.data?.error}`);
    }

    // 6. 999チャンネルを探す
    console.log('\n999チャンネル検索:');
    try {
      let allChannels = [];
      let cursor;

      do {
        const result = await client.conversations.list({
          types: 'public_channel,private_channel',
          limit: 100,
          cursor
        });
        allChannels = allChannels.concat(result.channels);
        cursor = result.response_metadata?.next_cursor;
      } while (cursor);

      const channels999 = allChannels.filter(c =>
        c.name.includes('999') || c.name === '999_info'
      );

      if (channels999.length > 0) {
        console.log(`\n見つかった999関連チャンネル:`);
        channels999.forEach(c => {
          console.log(`  ${c.is_private ? '🔒' : '#'} ${c.name}`);
          console.log(`    ID: ${c.id}`);
          console.log(`    メンバー: ${c.is_member ? 'Yes' : 'No'}`);
        });
      } else {
        console.log('  999関連チャンネルが見つかりません');
      }

      // d1_999_葛井テストを明示的に探す
      const kuzui = allChannels.find(c => c.name === 'd1_999_葛井テスト');
      if (kuzui) {
        console.log('\n✅ d1_999_葛井テスト が見つかりました！');
        console.log(`  タイプ: ${kuzui.is_private ? 'プライベート' : 'パブリック'}`);
        console.log(`  メンバー: ${kuzui.is_member ? 'Yes' : 'No'}`);
      } else {
        console.log('\n❌ d1_999_葛井テスト が見つかりません');
        console.log('   groups:read スコープが不足している可能性があります');
      }

    } catch (e) {
      console.log(`  エラー: ${e.data?.error}`);
    }

    console.log('\n========================================');
    console.log('必要な対応:');
    console.log('========================================');
    console.log('1. Slack App管理画面でOAuth & Permissionsを開く');
    console.log('2. Bot Token Scopesに以下を追加:');
    console.log('   - groups:read (プライベートチャンネル読み取り)');
    console.log('   - groups:write (プライベートチャンネル書き込み)');
    console.log('   - groups:history (プライベートチャンネル履歴)');
    console.log('3. アプリを再インストール');
    console.log('4. 新しいBot Tokenで環境変数を更新');
    console.log('5. プライベートチャンネルにボットを招待');

  } catch (error) {
    console.error('エラー:', error);
  }
}

checkOAuthScopes();