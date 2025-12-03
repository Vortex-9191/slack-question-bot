# User OAuth Token 設定ガイド

## ⚠️ 重要な注意事項
User Tokenは強力な権限を持つため、取り扱いには十分注意してください。

## 1. User Token Scopesの設定

### Slack App管理画面での設定

1. https://api.slack.com/apps でアプリを開く
2. **OAuth & Permissions** ページへ
3. **User Token Scopes** セクションで以下を追加：

#### 必要なUser Token Scopes
- `channels:read` - パブリックチャンネルの読み取り
- `groups:read` - プライベートチャンネルの読み取り
- `chat:write` - メッセージの送信
- `users:read` - ユーザー情報の読み取り

## 2. OAuth認証の実装

### 方法A: 手動でUser Tokenを取得（簡単だが非推奨）

1. Slack App管理画面で **OAuth & Permissions** ページを開く
2. **OAuth Tokens for Your Workspace** セクション
3. **User OAuth Token** (`xoxp-` または `xoxe-` で始まる) をコピー

### 方法B: OAuth認証フローを実装（推奨）

既に設定済みのRedirect URL:
```
https://slack-question-bot.onrender.com/slack/oauth/callback
```

## 3. 環境変数の設定

### Renderに追加する環境変数
```
SLACK_USER_TOKEN=xoxp-your-user-token
```

### .envファイルの更新（ローカルテスト用）
```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_USER_TOKEN=xoxp-your-user-token  # 追加
SLACK_SIGNING_SECRET=your-signing-secret
```

## 4. コードの実装

### app.jsの修正箇所

```javascript
// 2つのクライアントを作成
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);  // 通常の操作用
const userSlackClient = new WebClient(process.env.SLACK_USER_TOKEN);  // プライベートチャンネル検索用

// 医師チャンネル検索時はUser Tokenを使用
const result = await userSlackClient.conversations.list({
  types: 'public_channel,private_channel',
  limit: 1000,
  cursor
});

// メッセージ送信はBot Tokenのまま
await slackClient.chat.postMessage({
  channel: doctorChannel.id,
  text: '新しい質問が届きました',
  blocks: [...]
});
```

## 5. セキュリティ上の注意点

### リスク
1. **過剰な権限**: User Tokenはユーザーのすべてのチャンネルにアクセス可能
2. **プライバシー**: 意図しないチャンネルの情報も取得可能
3. **トークン漏洩**: 漏洩した場合の影響が大きい

### 対策
1. **最小限の使用**: チャンネル検索のみに使用
2. **環境変数で管理**: コードに直接記載しない
3. **定期的な更新**: トークンを定期的に再生成
4. **ログ管理**: User Tokenの使用をログに記録

## 6. 実装手順

1. Slack App管理画面でUser Token Scopesを追加
2. アプリを再インストール
3. User OAuth Tokenをコピー
4. Renderの環境変数に`SLACK_USER_TOKEN`を追加
5. app.jsを修正（次のステップで実装）

## 7. 代替案の再確認

User Tokenを使う前に、以下の代替案も検討してください：

### より安全な代替案
1. **ボットをプライベートチャンネルに招待**
   - 最も安全でシンプル
   - `/invite @accountingbot` を実行するだけ

2. **通知用のパブリックチャンネルを作成**
   - プライベートチャンネルの代わりにパブリックチャンネルを使用
   - アクセス制限が必要ない場合に有効

3. **管理者による一括招待スクリプト**
   - 全医師チャンネルにボットを一括招待
   - 初回のみの作業で済む