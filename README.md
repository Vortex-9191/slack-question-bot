# Slack Question Bot 🤖

Slackで質問を管理する自由記述チャットボット

## 機能

### 基本機能
- 📝 **自由記述の質問受付** - DMまたはメンションで質問を受け付け
- 💬 **スレッド形式の回答** - 質問に対してスレッドで回答
- 📊 **質問管理** - 未回答/回答済み/解決済みのステータス管理
- 🏷️ **カテゴリー分類** - 質問をカテゴリーごとに分類
- 👍 **フィードバック機能** - 回答の有用性を評価

### 管理機能
- 🔔 **管理チャンネルへの通知** - 新しい質問を管理チャンネルに通知
- 📈 **統計情報** - 質問の統計を確認
- 🔍 **検索機能** - 過去の質問を検索
- 📚 **FAQ機能** - よくある質問の管理

## セットアップ

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 環境変数の設定
`.env.example`を`.env`にコピーして編集:
```bash
cp .env.example .env
```

必要な環境変数:
- `SLACK_BOT_TOKEN`: Slackボットトークン
- `SLACK_APP_TOKEN`: Slackアプリトークン（Socket Mode用）
- `ADMIN_CHANNEL_ID`: 管理チャンネルID
- `PORT`: サーバーポート（デフォルト: 3000）

### 3. Slack App設定

#### 必要な権限（OAuth & Permissions）
- `app_mentions:read` - メンション読み取り
- `chat:write` - メッセージ送信
- `im:read` - DM読み取り
- `im:write` - DM送信
- `im:history` - DM履歴読み取り
- `users:read` - ユーザー情報読み取り
- `commands` - スラッシュコマンド

#### Event Subscriptions
Subscribe to bot events:
- `app_mention` - アプリメンション
- `message.im` - DM受信

Request URL: `https://your-domain.com/slack/events`

#### Interactivity & Shortcuts
Request URL: `https://your-domain.com/slack/events`

#### スラッシュコマンド
- `/question-stats` - 質問統計を表示

### 4. 起動
```bash
npm start
```

開発モード（自動リロード）:
```bash
npm run dev
```

## 使い方

### 質問する
1. **DM**: ボットに直接メッセージを送信
2. **メンション**: チャンネルで `@bot名 質問内容` を送信

### 質問に回答する（管理者）
1. 管理チャンネルに通知された質問の「📝 回答する」ボタンをクリック
2. モーダルで回答とカテゴリーを入力
3. 送信すると質問者に通知

### フィードバック
回答を受け取ったユーザーは「👍 役に立った」または「👎 改善が必要」でフィードバック可能

## データベース構造

### テーブル
- `questions` - 質問情報
- `answers` - 回答情報
- `faq` - よくある質問
- `feedback` - フィードバック情報

## デプロイ

### Render.comの場合
1. GitHubリポジトリと連携
2. 環境変数を設定
3. ビルドコマンド: `npm install`
4. スタートコマンド: `npm start`

### ローカルテスト
ngrokを使用:
```bash
# ターミナル1
npm start

# ターミナル2
ngrok http 3000
```

## ライセンス
MIT