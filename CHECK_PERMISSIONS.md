# 🔧 Slack Bot 権限チェックリスト

## 1. 必須の OAuth Scopes を確認

[Slack API](https://api.slack.com/apps) でアプリを開き、**OAuth & Permissions** で以下のスコープがすべて追加されているか確認：

### Bot Token Scopes (必須)
- [ ] `channels:read` - パブリックチャンネルを読む
- [ ] `channels:join` - パブリックチャンネルに参加
- [ ] `channels:history` - チャンネルの履歴を読む
- [ ] `chat:write` - メッセージを送信
- [ ] `commands` - スラッシュコマンドを受信
- [ ] `im:write` - DMを送信
- [ ] `users:read` - ユーザー情報を読む
- [ ] `groups:read` - プライベートチャンネルを読む ⚠️ **重要**
- [ ] `reactions:write` - リアクションを追加

### 追加で必要な可能性があるスコープ
- [ ] `groups:write` - プライベートチャンネルに投稿
- [ ] `conversations.connect:write` - Socket Mode用
- [ ] `im:read` - DMを読む
- [ ] `team:read` - チーム情報を読む

## 2. スコープを追加した後の手順

1. **アプリを再インストール**
   - OAuth & Permissions ページで「Reinstall to Workspace」をクリック
   - 新しい権限を承認

2. **新しいトークンを取得**
   - Bot User OAuth Token (`xoxb-...`) をコピー
   - Renderの環境変数 `SLACK_BOT_TOKEN` を更新

## 3. チャンネルの種類を確認

`d1_999_葛井テスト` チャンネルは：
- [ ] パブリックチャンネル（#アイコン）
- [ ] プライベートチャンネル（🔒アイコン）

**プライベートチャンネルの場合：**
- `groups:read` スコープが必須
- ボットを明示的にチャンネルに招待する必要がある

## 4. ボットをチャンネルに追加

チャンネルで以下を実行：
```
/invite @your-bot-name
```

または、チャンネル設定から：
1. チャンネル名をクリック
2. 「Settings」→「Add apps」
3. ボットを追加

## 5. テストスクリプト

以下のスクリプトでボットの権限をテスト：

```javascript
// test-permissions.js
require('dotenv').config();
const { WebClient } = require('@slack/web-api');

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

async function testPermissions() {
  console.log('🔍 権限テスト開始...\n');

  // 1. 認証テスト
  try {
    const auth = await client.auth.test();
    console.log('✅ 認証成功');
    console.log(`  Bot: ${auth.user}`);
    console.log(`  Team: ${auth.team}\n`);
  } catch (e) {
    console.log('❌ 認証失敗:', e.data);
    return;
  }

  // 2. チャンネルリスト取得テスト
  try {
    const result = await client.conversations.list({
      types: 'public_channel,private_channel',
      limit: 10
    });
    console.log(`✅ チャンネルリスト取得成功 (${result.channels.length}個)`);

    // d1_999を探す
    const targetChannel = result.channels.find(c =>
      c.name.includes('999')
    );

    if (targetChannel) {
      console.log(`\n🎯 医師チャンネル発見:`);
      console.log(`  名前: ${targetChannel.name}`);
      console.log(`  ID: ${targetChannel.id}`);
      console.log(`  タイプ: ${targetChannel.is_private ? 'プライベート' : 'パブリック'}`);
      console.log(`  メンバー: ${targetChannel.is_member ? 'Yes' : 'No'}`);
    } else {
      console.log('\n⚠️  999を含むチャンネルが見つかりません');
      console.log('最初の5個のチャンネル:');
      result.channels.slice(0, 5).forEach(c => {
        console.log(`  - ${c.name} (${c.is_private ? 'Private' : 'Public'})`);
      });
    }
  } catch (e) {
    console.log('❌ チャンネルリスト取得失敗:', e.data);
  }

  // 3. メッセージ送信テスト（自分自身に）
  try {
    const auth = await client.auth.test();
    await client.chat.postMessage({
      channel: auth.user_id,
      text: 'テストメッセージ: 権限確認OK'
    });
    console.log('\n✅ メッセージ送信成功');
  } catch (e) {
    console.log('\n❌ メッセージ送信失敗:', e.data);
  }
}

testPermissions();
```

実行：
```bash
node test-permissions.js
```

## 6. よくある問題と解決策

### 問題: チャンネルが見つからない
- **原因**: `channels:read` または `groups:read` スコープが不足
- **解決**: スコープを追加して再インストール

### 問題: is_member が false
- **原因**: ボットがチャンネルのメンバーではない
- **解決**: `/invite @bot-name` でボットを招待

### 問題: channel_not_found エラー
- **原因**: チャンネルIDが間違っている、またはアクセス権限がない
- **解決**: チャンネルの種類を確認し、適切なスコープを追加

### 問題: not_in_channel エラー
- **原因**: ボットがチャンネルに参加していない
- **解決**: `channels:join` スコープを追加、またはボットを招待

## 7. 環境変数の確認

Renderで以下が正しく設定されているか確認：
- `SLACK_BOT_TOKEN` - 最新のBot Token
- `SLACK_SIGNING_SECRET` - Signing Secret
- `ADMIN_CHANNEL_ID` - 管理チャンネルID（オプション）