# Slack Question Bot セットアップガイド

## 📝 概要
承認ワークフロー付き質問管理ボット

## 🚀 主な機能
- **質問フォーム**: カテゴリ選択 + 自由記述
- **承認ワークフロー**: 承認/却下/詳細確認
- **統計機能**: カテゴリ別・緊急度別分析
- **フィードバック**: 回答への評価機能

## 📦 必要な環境変数

`.env`ファイルに以下を設定：

```bash
# Slack Bot Token (xoxb-から始まる)
SLACK_BOT_TOKEN=xoxb-xxx

# Slack App Token (xapp-から始まる) - Socket Mode用
SLACK_APP_TOKEN=xapp-xxx

# Slack Signing Secret - リクエスト検証用
SLACK_SIGNING_SECRET=xxx

# 管理チャンネルID
ADMIN_CHANNEL_ID=Cxxx
```

## 🔧 Slack App設定

### 1. Socket Mode
- Settings > Socket Mode > Enable Socket Mode をON

### 2. Slash Commands
以下のコマンドを登録：
- `/ask-question` - 質問フォームを開く
- `/question-stats` - 統計情報を表示

### 3. OAuth Scopes (Bot Token Scopes)
- `commands` - スラッシュコマンド
- `chat:write` - メッセージ送信
- `channels:history` - チャンネル履歴
- `groups:history` - プライベートチャンネル
- `im:history` - DM履歴
- `mpim:history` - グループDM

### 4. Event Subscriptions
Socket Mode使用時は不要

## 📂 ファイル構成
```
├── app.js                    # メインアプリケーション (新実装)
├── data-storage-enhanced.js  # 拡張データベース機能
├── index.js                  # 旧実装（参考用）
├── data-storage.js          # 旧データベース
└── .env                     # 環境変数
```

## 🎯 起動方法

1. 依存関係インストール
```bash
npm install
```

2. 環境変数チェック
```bash
node check-env.js
```

3. アプリ起動
```bash
node app.js
```

## 📊 コマンド使用方法

### 質問を投稿
```
/ask-question
```
モーダルフォームが開き、以下を入力：
- カテゴリ選択（技術/ビジネス/プロセス等）
- タイトル（必須）
- 詳細（必須）
- 緊急度（オプション）

### 統計を確認
```
/question-stats
```
表示内容：
- 総質問数
- 回答済み/未回答数
- 承認/却下数
- カテゴリ別統計
- 回答率

## 🔄 ワークフロー

1. **質問投稿** → モーダルフォームで入力
2. **管理者通知** → 管理チャンネルに通知
3. **承認プロセス** → 承認/却下/詳細確認
4. **回答入力** → 承認後、回答モーダルで入力
5. **フィードバック** → 質問者が評価

## ⚠️ トラブルシューティング

### コマンドがタイムアウトする場合
1. Socket Modeが有効か確認
2. SLACK_APP_TOKENが正しいか確認
3. アプリを再インストール

### 環境変数エラー
```bash
node check-env.js
```
で不足している変数を確認

### データベースエラー
```bash
rm questions.db
node app.js
```
でデータベースを再作成