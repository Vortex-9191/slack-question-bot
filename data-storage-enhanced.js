const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'questions.db');
const db = new sqlite3.Database(dbPath);

// データベース初期化（拡張版）
function initDatabase() {
  db.serialize(() => {
    // 拡張された質問テーブル
    db.run(`CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT NOT NULL,
      urgency TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'pending',
      channel_id TEXT,
      message_ts TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 承認履歴テーブル
    db.run(`CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id TEXT NOT NULL,
      approver_id TEXT NOT NULL,
      action TEXT NOT NULL,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES questions(id)
    )`);

    // 回答テーブル
    db.run(`CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id TEXT NOT NULL,
      answered_by TEXT NOT NULL,
      answer_text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES questions(id)
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

  console.log('✅ データベース初期化完了（拡張版）');
}

// 質問を保存（拡張版）
function saveQuestion(question) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO questions (id, user_id, type, title, details, urgency, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      question.id,
      question.userId,
      question.type,
      question.title,
      question.details,
      question.urgency || 'medium',
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

// 質問を更新
function updateQuestion(questionId, updates) {
  return new Promise((resolve, reject) => {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updates), questionId];

    db.run(
      `UPDATE questions SET ${fields}, updated_at = datetime('now') WHERE id = ?`,
      values,
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      }
    );
  });
}

// 質問のステータスを更新
function updateQuestionStatus(questionId, status) {
  return updateQuestion(questionId, { status });
}

// 承認履歴を保存
function saveApproval(approval) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO approvals (question_id, approver_id, action, comment)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      approval.questionId,
      approval.approverId,
      approval.action,
      approval.comment || null,
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

// 回答を保存
function saveAnswer(answer) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO answers (question_id, answered_by, answer_text)
      VALUES (?, ?, ?)
    `);

    stmt.run(
      answer.questionId,
      answer.answeredBy,
      answer.answerText,
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
      "SELECT * FROM questions WHERE status = 'pending' OR status = 'approved' ORDER BY created_at DESC",
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

// 質問を検索
function searchQuestions(keyword) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM questions WHERE title LIKE ? OR details LIKE ? ORDER BY created_at DESC LIMIT 10",
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

// 統計情報を取得（拡張版）
function getQuestionStats() {
  return new Promise((resolve, reject) => {
    const queries = {
      total: "SELECT COUNT(*) as count FROM questions",
      pending: "SELECT COUNT(*) as count FROM questions WHERE status = 'pending'",
      approved: "SELECT COUNT(*) as count FROM questions WHERE status = 'approved'",
      answered: "SELECT COUNT(*) as count FROM questions WHERE status = 'answered'",
      rejected: "SELECT COUNT(*) as count FROM questions WHERE status = 'rejected'",
      byCategory: "SELECT type, COUNT(*) as count FROM questions GROUP BY type",
      byUrgency: "SELECT urgency, COUNT(*) as count FROM questions GROUP BY urgency"
    };

    const stats = {};
    let completed = 0;
    const totalQueries = Object.keys(queries).length;

    // 通常のカウント
    Object.entries(queries).forEach(([key, query]) => {
      if (key === 'byCategory' || key === 'byUrgency') {
        db.all(query, (err, rows) => {
          if (err) {
            console.error(`Error getting ${key}:`, err);
          } else {
            stats[key] = {};
            rows.forEach(row => {
              stats[key][row.type || row.urgency] = row.count;
            });
          }
          completed++;
          if (completed === totalQueries) {
            // 回答率を計算
            const answerRate = stats.total > 0
              ? Math.round((stats.answered / stats.total) * 100) + '%'
              : '0%';
            stats.answerRate = answerRate;
            resolve(stats);
          }
        });
      } else {
        db.get(query, (err, row) => {
          if (err) {
            console.error(`Error getting ${key}:`, err);
          } else {
            stats[key] = row ? row.count : 0;
          }
          completed++;
          if (completed === totalQueries) {
            // 回答率を計算
            const answerRate = stats.total > 0
              ? Math.round((stats.answered / stats.total) * 100) + '%'
              : '0%';
            stats.answerRate = answerRate;
            resolve(stats);
          }
        });
      }
    });
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

module.exports = {
  initDatabase,
  saveQuestion,
  getQuestion,
  updateQuestion,
  updateQuestionStatus,
  saveApproval,
  saveAnswer,
  getUnansweredQuestions,
  searchQuestions,
  getQuestionStats,
  saveFeedback
};