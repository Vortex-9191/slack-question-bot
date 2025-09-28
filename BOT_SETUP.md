# Slack Bot セットアップガイド

## 必要な OAuth Scopes (Bot Token Scopes)

Slack App の設定で以下のスコープを追加してください：

### 必須スコープ
- `channels:read` - パブリックチャンネルのリストを取得
- `channels:join` - パブリックチャンネルへの参加
- `channels:history` - チャンネルのメッセージ履歴を読む
- `chat:write` - メッセージの送信
- `commands` - スラッシュコマンドの受信
- `im:write` - ダイレクトメッセージの送信
- `users:read` - ユーザー情報の取得
- `reactions:write` - リアクションの追加
- `groups:read` - プライベートチャンネルのリストを取得（医師チャンネル用）

### 推奨スコープ
- `groups:write` - プライベートチャンネルへのメッセージ送信
- `im:read` - ダイレクトメッセージの読み取り
- `reactions:read` - リアクションの読み取り

## セットアップ手順

### 1. Slack App の OAuth & Permissions 設定

1. [Slack API](https://api.slack.com/apps) にアクセス
2. あなたのアプリを選択
3. 左メニューから「OAuth & Permissions」を選択
4. 「Scopes」セクションで「Bot Token Scopes」に上記のスコープを追加
5. 「Install to Workspace」または「Reinstall to Workspace」をクリック

### 2. Slash Commands 設定

1. 左メニューから「Slash Commands」を選択
2. 「Create New Command」をクリック
3. 以下を設定：
   - Command: `/question`
   - Request URL: `https://slack-question-bot.onrender.com/slack/slash-commands`
   - Short Description: 質問を投稿
   - Usage Hint: [optional]

### 3. Interactivity & Shortcuts 設定

1. 左メニューから「Interactivity & Shortcuts」を選択
2. 「Interactivity」をONにする
3. Request URL: `https://slack-question-bot.onrender.com/slack/interactive`
4. 保存

### 4. 環境変数の設定（Render）

Renderのダッシュボードで以下の環境変数を設定：

- `SLACK_BOT_TOKEN` - Bot User OAuth Token (xoxb-で始まる)
- `SLACK_SIGNING_SECRET` - Signing Secret
- `ADMIN_CHANNEL_ID` - 管理チャンネルのID（オプション）

### 5. ボットをチャンネルに招待

**重要**: ボットが以下のチャンネルに参加している必要があります：

1. **コマンドを使用するチャンネル**
   - チャンネルで `/invite @ボット名` を実行

2. **医師のチャンネル**
   - 各医師のチャンネルで `/invite @ボット名` を実行
   - または、チャンネル設定からボットを追加

## チャンネル命名規則

医師チャンネルは以下のいずれかの形式にする必要があります：

- `d{番号}_{医師ID}_*` （例: d1_999_田中）
- `d_{医師ID}_*` （例: d_999_田中）
- `doctor_{医師ID}` （例: doctor_999）
- `{医師ID}` （医師IDそのもの）

## トラブルシューティング

### 「channel_not_found」エラーが発生する場合

1. ボットがチャンネルに参加しているか確認
2. Bot Token Scopesに必要な権限があるか確認
3. プライベートチャンネルの場合、`groups:read`と`groups:write`スコープが必要

### 「not_in_channel」エラーが発生する場合

チャンネルでボットを招待：
```
/invite @your-bot-name
```

### 医師チャンネルが見つからない場合

1. チャンネル名が上記の命名規則に従っているか確認
2. ボットがそのチャンネルにアクセス権限を持っているか確認
3. プライベートチャンネルの場合、ボットを明示的に招待する必要があります

## デバッグモード

環境変数 `DEBUG=true` を設定すると、詳細なログが出力されます。