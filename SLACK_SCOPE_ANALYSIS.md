# Slackスコープ分析：なぜプライベートチャンネルにアクセスできないのか

## 1. スコープの基本理解

### Bot Token Scopes
- **Bot自身の権限**
- ボットユーザーとして動作
- `groups:read`があってもプライベートチャンネルはメンバーでないと見えない

### User Token Scopes
- **ユーザーの権限を代行**
- そのユーザーがアクセスできるすべてのチャンネルにアクセス可能
- プライベートチャンネルでもユーザーがメンバーならアクセス可能

## 2. groups:readスコープの実際の動作

### 公式ドキュメントによると
```
groups:read - View basic information about private channels that 書類確認＠β版さん has been added to
```

**重要**: "that 書類確認＠β版さん has been added to" = ボットが追加されたチャンネルのみ

### つまり
- `groups:read`があっても、ボットがメンバーでないプライベートチャンネルは見えない
- これはSlack APIの仕様

## 3. 現在の状況分析

### slack-question-bot (accountingbot)
- Bot Token Scopesに`groups:read`あり ✅
- `d1_999_葛井テスト`のメンバーではない ❌
- 結果：チャンネルが見えない

### document-confirmation-bot (書類確認＠β版さん)
以下の2つの可能性：

#### 可能性A：ボットがメンバー
- Bot Token Scopesに`groups:read`あり ✅
- `d1_999_葛井テスト`のメンバー ✅
- 結果：チャンネルが見える

#### 可能性B：User Tokenを使用
- User Token Scopesが設定されている
- インストールしたユーザーが`d1_999_葛井テスト`のメンバー
- 結果：チャンネルが見える

## 4. 検証方法

### 方法1：API呼び出しで使用トークンを確認

```javascript
// どのトークンを使っているか確認
const { WebClient } = require('@slack/web-api');

// Bot Token
const botClient = new WebClient(process.env.SLACK_BOT_TOKEN);

// User Token（もし存在すれば）
const userClient = new WebClient(process.env.SLACK_USER_TOKEN);

// それぞれでconversations.listを実行して結果を比較
```

### 方法2：ボットのメンバーシップを確認

1. Slackで`d1_999_葛井テスト`チャンネルを開く
2. チャンネル設定 → メンバー
3. 「書類確認＠β版さん」がいるか確認

### 方法3：トークンタイプを確認

```javascript
async function checkTokenType(token) {
  const client = new WebClient(token);
  const auth = await client.auth.test();

  if (token.startsWith('xoxb-')) {
    console.log('Bot Token');
  } else if (token.startsWith('xoxp-')) {
    console.log('User Token');
  }

  console.log('User:', auth.user);
  console.log('User ID:', auth.user_id);
  console.log('Is Bot:', auth.is_bot);
}
```

## 5. 解決策

### 解決策1：ボットをチャンネルに招待（推奨）
```
/invite @accountingbot
```
- 最もシンプルで安全
- Bot Tokenのまま使用可能

### 解決策2：User OAuth Tokenを追加（非推奨）
- セキュリティリスクあり
- ユーザーの全チャンネルアクセス権限を持つ
- 必要以上の権限

### 解決策3：チャンネル構造を変更
- プライベートチャンネルをパブリックに変更
- または別の通知用パブリックチャンネルを作成

## 6. なぜdocument-confirmation-botは動作するのか

最も可能性が高いシナリオ：

1. **過去にボットが招待された**
   - 「書類確認＠β版さん」が`d1_999_葛井テスト`に招待済み
   - `groups:read`スコープで見える

2. **accountingbotは新しいボット**
   - まだ`d1_999_葛井テスト`に招待されていない
   - `groups:read`があっても見えない

## 7. 結論

**groups:readスコープだけではプライベートチャンネルにアクセスできない**

必要な条件：
1. `groups:read`スコープ ✅（既にある）
2. ボットがチャンネルのメンバー ❌（これが不足）

**解決方法**：
```
Slackで実行: /invite @accountingbot
```

これでdocument-confirmation-botと同じようにプライベートチャンネルにアクセスできるようになります。