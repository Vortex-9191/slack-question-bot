# 📋 Slack Question Bot セットアップガイド

## 1️⃣ GitHubリポジトリの作成

1. [GitHub](https://github.com)にアクセス
2. 右上の「+」→「New repository」
3. Repository name: `slack-question-bot`
4. Public/Privateを選択
5. 「Create repository」をクリック

その後、ローカルからプッシュ:
```bash
cd /Users/tsukasa.okimori/slack-question-bot
git remote add origin https://github.com/YOUR_USERNAME/slack-question-bot.git
git push -u origin main
```

---

## 2️⃣ Slack Appの作成

### Step 1: アプリ作成
1. [Slack API](https://api.slack.com/apps) にアクセス
2. 「Create New App」をクリック
3. 「From scratch」を選択
4. App Name: `Question Bot` (好きな名前)
5. ワークスペースを選択して「Create App」

### Step 2: Bot Token Scopesの設定
左メニュー「OAuth & Permissions」から以下のスコープを追加:

**Bot Token Scopes:**
- `app_mentions:read` - メンション読み取り
- `chat:write` - メッセージ送信
- `chat:write.public` - パブリックチャンネルへの送信
- `im:read` - DM読み取り
- `im:write` - DM送信
- `im:history` - DM履歴
- `users:read` - ユーザー情報
- `commands` - スラッシュコマンド
- `channels:read` - チャンネル情報

### Step 3: Event Subscriptionsの設定
1. 左メニュー「Event Subscriptions」
2. Enable Eventsを「On」
3. Request URL: `https://your-domain.com/slack/events`
   - ローカルテストの場合: `https://xxxxx.ngrok.io/slack/events`
4. **Subscribe to bot events**で以下を追加:
   - `app_mention` - アプリメンション
   - `message.im` - ダイレクトメッセージ

### Step 4: Interactivity & Shortcutsの設定
1. 左メニュー「Interactivity & Shortcuts」
2. Interactivityを「On」
3. Request URL: `https://your-domain.com/slack/events`

### Step 5: Slash Commandsの設定
1. 左メニュー「Slash Commands」
2. 「Create New Command」
3. コマンド追加:
   - Command: `/question-stats`
   - Request URL: `https://your-domain.com/slack/slash-commands`
   - Short Description: 質問統計を表示
   - Usage Hint: (空欄でOK)

### Step 6: アプリのインストール
1. 左メニュー「Install App」
2. 「Install to Workspace」をクリック
3. 権限を確認して「許可する」

### Step 7: トークンの取得
インストール後、以下のトークンをコピー:
- **Bot User OAuth Token**: `xoxb-`で始まるトークン
- **App-Level Token** (Socket Mode使用時): 
  1. 「Basic Information」→「App-Level Tokens」
  2. 「Generate Token and Scopes」
  3. Token Name: 任意
  4. Scope: `connections:write`を追加
  5. 「Generate」

---

## 3️⃣ ローカル環境のセットアップ

### 環境変数の設定
```bash
cd /Users/tsukasa.okimori/slack-question-bot
cp .env.example .env
```

`.env`を編集:
```env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token  # Socket Mode使用時のみ
ADMIN_CHANNEL_ID=C-your-channel-id  # 管理チャンネル
PORT=3000
```

### 管理チャンネルIDの取得方法
1. Slackでチャンネル名を右クリック
2. 「チャンネル詳細を表示」
3. 一番下の「チャンネルID」をコピー

### 依存関係のインストール
```bash
npm install
```

---

## 4️⃣ ローカルテスト（ngrok使用）

### ngrokのセットアップ
```bash
# ngrokのインストール（まだの場合）
brew install ngrok

# ターミナル1: アプリ起動
npm start

# ターミナル2: ngrokでトンネル作成
ngrok http 3000
```

### SlackのURL更新
ngrokのURL（`https://xxxxx.ngrok.io`）を以下の場所に設定:
1. Event Subscriptions → Request URL
2. Interactivity & Shortcuts → Request URL
3. Slash Commands → Request URL

---

## 5️⃣ Renderへのデプロイ

### Renderでの設定
1. [Render](https://render.com)にログイン
2. 「New」→「Web Service」
3. GitHubリポジトリを接続
4. 設定:
   - Name: `slack-question-bot`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Environment Variablesに環境変数を設定
6. 「Create Web Service」

### デプロイ後のSlack設定更新
RenderのURL（`https://your-app.onrender.com`）を各Request URLに設定

---

## 6️⃣ ボットの使い方

### 質問する
1. **DM**: ボットに直接メッセージ
2. **メンション**: `@Question Bot 質問内容`

### 管理者として回答
1. 管理チャンネルに通知が届く
2. 「📝 回答する」ボタンをクリック
3. モーダルで回答を入力
4. 質問者にスレッドで回答が送信される

### コマンド
- `/question-stats` - 質問の統計を表示

---

## 🔧 トラブルシューティング

### URLの検証に失敗する場合
- アプリが起動していることを確認
- ngrokのURLが正しいことを確認
- `/slack/events`エンドポイントが正しく動作しているか確認

### メッセージが受信できない場合
- Bot TokenがSLACK_BOT_TOKENに設定されているか確認
- Event Subscriptionsが有効になっているか確認
- ボットがチャンネルに招待されているか確認

### データベースエラー
- `questions.db`の権限を確認
- SQLite3が正しくインストールされているか確認

---

## 📞 サポート

問題が解決しない場合は、以下を確認:
1. コンソールのエラーログ
2. Slackの「Your Apps」ページのエラーログ
3. Renderのログ（デプロイ時）