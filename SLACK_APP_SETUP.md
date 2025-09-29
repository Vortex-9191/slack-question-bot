# 🚀 Slack App 完全セットアップガイド

## 1. OAuth & Permissions 設定

### Redirect URLs
**重要**: OAuth認証を使用する場合は設定が必要

1. **OAuth & Permissions** ページを開く
2. **Redirect URLs** セクションで「Add New Redirect URL」をクリック
3. 以下のURLを追加：
   ```
   https://slack-question-bot.onrender.com/slack/oauth/callback
   ```
4. 「Add」→「Save URLs」をクリック

### OAuth Scopes (Bot Token Scopes)
以下のスコープをすべて追加：

#### 必須スコープ（プライベートチャンネルアクセスに必要）
- `channels:history` - チャンネルメッセージ履歴
- `channels:join` - パブリックチャンネルへの参加
- `channels:read` - パブリックチャンネル情報の読み取り
- `chat:write` - メッセージの送信
- `commands` - スラッシュコマンド
- `groups:history` - プライベートチャンネルの履歴
- `groups:read` - プライベートチャンネル情報の読み取り **🔴 最重要：プライベートチャンネルアクセスに必須**
- `groups:write` - プライベートチャンネルへの投稿
- `im:history` - DM履歴
- `im:read` - DM情報の読み取り
- `im:write` - DMの送信
- `reactions:write` - リアクション追加
- `team:read` - ワークスペース情報
- `users:read` - ユーザー情報

**重要**: `groups:read`スコープがないとプライベートチャンネル（d1_999_葛井テストなど）にアクセスできません。

### Install App
1. スコープを追加後、**「Install to Workspace」**または**「Reinstall to Workspace」**をクリック
2. 権限を確認して承認
3. **Bot User OAuth Token** (`xoxb-...`) をコピー

## 2. Interactivity & Shortcuts 設定

1. **Interactivity & Shortcuts** ページを開く
2. **Interactivity** を「ON」にする
3. **Request URL** に以下を入力：
   ```
   https://slack-question-bot.onrender.com/slack/interactive
   ```
4. 「Save Changes」をクリック

## 3. Slash Commands 設定

1. **Slash Commands** ページを開く
2. 「Create New Command」をクリック
3. 以下を設定：

| フィールド | 値 |
|---------|---|
| Command | `/question` |
| Request URL | `https://slack-question-bot.onrender.com/slack/slash-commands` |
| Short Description | 質問を投稿 |
| Usage Hint | [患者IDを入力] |
| Escape channels, users, and links sent to your app | ✓ チェック |

4. 「Save」をクリック

## 4. Event Subscriptions（オプション）

Socket Modeを使用しない場合：

1. **Event Subscriptions** ページを開く
2. **Enable Events** を「ON」にする
3. **Request URL** に以下を入力：
   ```
   https://slack-question-bot.onrender.com/slack/events
   ```
4. URL検証が成功するまで待つ
5. **Subscribe to bot events** で必要なイベントを追加

## 5. App Home 設定

1. **App Home** ページを開く
2. **Show Tabs** セクション：
   - Home Tab: ✓ ON
   - Messages Tab: ✓ ON
3. **Always Show My Bot as Online**: ✓ ON

## 6. Basic Information

1. **Basic Information** ページで以下を確認：
   - **Signing Secret** をコピー（環境変数用）
   - **Verification Token** をコピー（レガシー用）

## 7. 環境変数の設定

### Renderの環境変数
以下を設定または更新：

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_CLIENT_ID=your-client-id        # OAuth用（オプション）
SLACK_CLIENT_SECRET=your-client-secret # OAuth用（オプション）
ADMIN_CHANNEL_ID=C0951BS5QHW          # 管理チャンネル（オプション）
```

## 8. 設定後の確認

### チェックリスト
- [ ] Bot Token Scopesがすべて追加されている
- [ ] アプリが再インストールされている
- [ ] Request URLsが正しく設定されている
- [ ] Renderの環境変数が更新されている
- [ ] ボットがオンラインになっている

### テスト手順

1. **権限テスト（ローカル）**
   ```bash
   node test-permissions.js
   ```

2. **チャンネル参加テスト**
   ```bash
   node join-channels.js
   ```

3. **Slackでテスト**
   - 任意のチャンネルで `/question` を実行
   - フォームが表示されることを確認

## 9. トラブルシューティング

### 「dispatch_failed」エラー
- Request URLが正しいか確認
- Renderアプリが起動しているか確認
- Signing Secretが正しいか確認

### 「channel_not_found」エラー
- ボットがチャンネルに参加しているか確認
- `groups:read` スコープがあるか確認
- チャンネルで `/invite @bot-name` を実行

### 「not_in_channel」エラー
- チャンネルにボットを招待
- `channels:join` スコープを確認

### 「missing_scope」エラー
- 必要なスコープを追加
- アプリを再インストール
- 新しいトークンで環境変数を更新

## 10. 医師チャンネルの設定

医師チャンネルは以下の命名規則に従う必要があります：

- `d1_{医師ID}_{名前}` （例: d1_999_葛井テスト）
- `d_{医師ID}_{名前}` （例: d_999_田中）
- `doctor_{医師ID}` （例: doctor_999）

### チャンネル作成後の手順

1. チャンネルを作成（パブリックまたはプライベート）
2. ボットを招待：`/invite @your-bot-name`
3. チャンネルIDを確認（チャンネル設定から）
4. 必要に応じて環境変数に追加

## 参考リンク

- [Slack API Documentation](https://api.slack.com/)
- [OAuth Scopes](https://api.slack.com/scopes)
- [Slash Commands](https://api.slack.com/interactivity/slash-commands)
- [Interactive Components](https://api.slack.com/interactivity)