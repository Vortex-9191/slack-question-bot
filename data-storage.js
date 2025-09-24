const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'questions.db');
const db = new sqlite3.Database(dbPath);

// データベース初期化
function initDatabase() {
  db.serialize(() => {
    // 質問テーブル
    db.run(`CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      channel_id TEXT,
      message_ts TEXT,
      status TEXT DEFAULT 'pending',
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 回答テーブル
    db.run(`CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id TEXT NOT NULL,
      answered_by TEXT NOT NULL,
      answer TEXT NOT NULL,
      category TEXT,
      helpful_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES questions(id)
    )`);

    // FAQテーブル
    db.run(`CREATE TABLE IF NOT EXISTS faq (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      category TEXT,
      keywords TEXT,
      usage_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // フィードバックテーブル
    db.run(`CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      rating TEXT,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES questions(id)
    )`);
  });

  console.log('✅ データベース初期化完了');
}

// 質問を保存
function saveQuestion(question) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO questions (id, user_id, text, channel_id, message_ts, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      question.id,
      question.userId,
      question.text,
      question.channelId,
      question.messageTs,
      question.status || 'pending',
      function(err) {
        if (err) {
          console.error('質問保存エラー:', err);
          reject(err);
        } else {
          console.log(`質問保存: ${question.id}`);
          resolve(this.lastID);
        }
      }
    );
    
    stmt.finalize();
  });
}

// 質問を取得
function getQuestion(questionId) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT * FROM questions WHERE id = ?",
      [questionId],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      }
    );
  });
}

// 質問のステータスを更新
function updateQuestionStatus(questionId, status) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE questions SET status = ?, updated_at = datetime('now') WHERE id = ?",
      [status, questionId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          console.log(`ステータス更新: ${questionId} -> ${status}`);
          resolve(this.changes);
        }
      }
    );
  });
}

// 回答を保存
function saveAnswer(answer) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO answers (question_id, answered_by, answer, category)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(
      answer.questionId,
      answer.answeredBy,
      answer.answer,
      answer.category,
      function(err) {
        if (err) {
          console.error('回答保存エラー:', err);
          reject(err);
        } else {
          console.log(`回答保存: ${answer.questionId}`);
          resolve(this.lastID);
        }
      }
    );
    
    stmt.finalize();
  });
}

// 未回答の質問を取得
function getUnansweredQuestions() {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM questions WHERE status = 'pending' ORDER BY created_at DESC",
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

// 類似の質問を検索
function searchQuestions(keyword) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM questions WHERE text LIKE ? ORDER BY created_at DESC LIMIT 5",
      [`%${keyword}%`],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

// FAQを検索
function searchFAQ(keyword) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM faq WHERE question LIKE ? OR keywords LIKE ? ORDER BY usage_count DESC LIMIT 3",
      [`%${keyword}%`, `%${keyword}%`],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

// フィードバックを保存
function saveFeedback(feedback) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO feedback (question_id, user_id, rating, comment)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(
      feedback.questionId,
      feedback.userId,
      feedback.rating,
      feedback.comment || '',
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
    
    stmt.finalize();
  });
}

// 統計情報を取得
function getStatistics() {
  return new Promise((resolve, reject) => {
    const queries = {
      total: "SELECT COUNT(*) as count FROM questions",
      pending: "SELECT COUNT(*) as count FROM questions WHERE status = 'pending'",
      answered: "SELECT COUNT(*) as count FROM questions WHERE status = 'answered'",
      resolved: "SELECT COUNT(*) as count FROM questions WHERE status = 'resolved'"
    };
    
    const stats = {};
    let completed = 0;
    
    Object.keys(queries).forEach(key => {
      db.get(queries[key], (err, row) => {
        if (err) {
          reject(err);
        } else {
          stats[key] = row.count;
          completed++;
          if (completed === Object.keys(queries).length) {
            resolve(stats);
          }
        }
      });
    });
  });
}

module.exports = {
  initDatabase,
  saveQuestion,
  getQuestion,
  updateQuestionStatus,
  saveAnswer,
  getUnansweredQuestions,
  searchQuestions,
  searchFAQ,
  saveFeedback,
  getStatistics
};