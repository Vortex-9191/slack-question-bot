# プライベートチャンネルアクセス設定ガイド

## 問題
現在のボットが`d1_999_葛井テスト`などのプライベートチャンネルにアクセスできない。

## 原因
`groups:read` OAuth スコープが不足している。

## 解決手順

### 1. Slack App管理画面を開く
https://api.slack.com/apps でアプリを選択

### 2. OAuth & Permissions ページで以下のスコープを確認・追加

#### プライベートチャンネルアクセスに必須のスコープ
- `groups:read` - プライベートチャンネル一覧の取得
- `groups:write` - プライベートチャンネルへの投稿
- `groups:history` - プライベートチャンネルの履歴読み取り

これらがないと、プライベートチャンネルは**一切表示されません**。

### 3. アプリを再インストール
1. スコープ追加後、「Reinstall to Workspace」をクリック
2. 新しい権限を承認
3. 新しい Bot Token (`xoxb-...`) をコピー

### 4. 環境変数を更新
```bash
# Renderの環境変数を更新
SLACK_BOT_TOKEN=xoxb-新しいトークン
```

### 5. プライベートチャンネルにボットを招待
各プライベートチャンネルで以下を実行：
```
/invite @your-bot-name
```

### 6. 確認テスト
```bash
node test-permissions.js
```

## なぜdocument-confirmation-botはアクセスできるのか？

document-confirmation-slack-botは以下の設定になっている：

```javascript
// conversations.listの呼び出し
const result = await slackClient.conversations.list({
  types: 'public_channel,private_channel',  // 両方を指定
  limit: 1000,
  cursor
});
```

この呼び出しが成功するには、以下が必要：
1. `channels:read` スコープ（パブリックチャンネル用）
2. `groups:read` スコープ（プライベートチャンネル用）
3. ボットがプライベートチャンネルのメンバーである

## 重要な注意点

1. **スコープだけでは不十分**
   - `groups:read`があっても、ボットがメンバーでないプライベートチャンネルは見えない
   - 各プライベートチャンネルに手動でボットを招待する必要がある

2. **999_infoチャンネルについて**
   - 現在のログで`999_info`は見つかっているが、`is_member: false`
   - このチャンネルにボットを招待する必要がある

3. **d1_999_葛井テストについて**
   - プライベートチャンネルの可能性が高い
   - `groups:read`スコープ追加後、ボットを招待する必要がある

## トラブルシューティング

### チャンネルが見つからない場合
1. OAuth スコープを確認
2. アプリが再インストールされているか確認
3. ボットがチャンネルのメンバーか確認

### "missing_scope"エラーが出る場合
```
Error: missing_scope
```
→ `groups:read`スコープを追加してアプリを再インストール

### チャンネルは見えるがメッセージ送信できない場合
→ `groups:write`スコープも追加