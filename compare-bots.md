# ボット比較

## 重要な質問

1. **document-confirmation-botとslack-question-botは同じボットトークンを使っていますか？**
   - もし異なるボットなら、それぞれ異なるチャンネルメンバーシップを持っている

2. **document-confirmation-botのボット名は何ですか？**
   - 現在のボット: `accountingbot`
   - document-confirmation-bot: ?

3. **d1_999_葛井テストのメンバーを確認**
   - document-confirmation-botのボットがメンバー
   - accountingbotはメンバーではない？

## 検証方法

### 1. Slackでチャンネル情報を確認
`d1_999_葛井テスト`チャンネルで:
- メンバーリストを確認
- どのボットがメンバーになっているか確認

### 2. document-confirmation-botのボットを確認
- Slack App管理画面で確認
- または実行時のログで確認

## 可能性のある原因

### 原因1: 異なるボット
- document-confirmation-bot → 別のボット（例：docbot）
- slack-question-bot → accountingbot
- docbotは`d1_999_葛井テスト`のメンバーだが、accountingbotはメンバーではない

### 原因2: 同じボットだがタイミングの問題
- document-confirmation-botが動作した時はメンバーだった
- その後、何らかの理由でボットが削除された

### 原因3: チャンネルの可視性設定
- document-confirmation-botには見えるが、slack-question-botには見えない設定がある？

## 確認すべきこと

1. **Slack App管理画面で両方のアプリを確認**
   - document-confirmation用のアプリ
   - slack-question用のアプリ
   - それぞれのBot名とBot IDを確認

2. **`d1_999_葛井テスト`チャンネルのメンバーリスト**
   - どのボットが含まれているか

3. **document-confirmation-botの実際の動作**
   - 本当に`d1_999_葛井テスト`に送信できているか
   - それとも別のチャンネルに送信しているか