-- 質問データを保存するテーブル
CREATE TABLE IF NOT EXISTS questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  question_type TEXT NOT NULL,
  question_type_label TEXT,
  doctor_name TEXT NOT NULL,
  doctor_id TEXT NOT NULL,
  question_content TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT,
  original_channel_id TEXT,
  original_message_ts TEXT,
  doctor_channel_id TEXT,
  status TEXT DEFAULT 'pending', -- pending, answered, approved
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 回答データを保存するテーブル
CREATE TABLE IF NOT EXISTS answers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id TEXT REFERENCES questions(question_id),
  answer_content TEXT NOT NULL,
  answered_by TEXT NOT NULL,
  answered_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_questions_patient_id ON questions(patient_id);
CREATE INDEX IF NOT EXISTS idx_questions_doctor_id ON questions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_created_at ON questions(created_at);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);

-- RLSを有効化（Edge Functionsからはservice_roleで接続するため、全アクセス許可）
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

-- service_role用のポリシー
CREATE POLICY "Service role can do everything on questions" ON questions
  FOR ALL USING (true);
CREATE POLICY "Service role can do everything on answers" ON answers
  FOR ALL USING (true);
