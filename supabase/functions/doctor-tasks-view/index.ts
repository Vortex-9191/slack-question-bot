import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // URLパラメータから医師IDを取得
    const url = new URL(req.url);
    const doctorId = url.searchParams.get("doctor_id");
    const statusFilter = url.searchParams.get("status") || "all";

    // 医師の質問一覧を取得
    let query = supabase
      .from("questions")
      .select("*, answers(*)")
      .order("created_at", { ascending: false });

    if (doctorId) {
      query = query.eq("doctor_id", doctorId);
    }

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data: questions, error } = await query;

    if (error) throw error;

    // 統計情報を計算
    const stats = {
      total: questions?.length || 0,
      pending: questions?.filter((q: any) => q.status === "pending").length || 0,
      answered: questions?.filter((q: any) => q.status === "answered").length || 0,
      approved: questions?.filter((q: any) => q.status === "approved").length || 0,
    };

    // HTMLを生成
    const html = generateHTML(questions || [], stats, doctorId, statusFilter);

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
      },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      `<html><body><h1>Error</h1><p>${error.message}</p></body></html>`,
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
});

function generateHTML(questions: any[], stats: any, doctorId: string | null, statusFilter: string): string {
  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "#f59e0b",
      answered: "#10b981",
      approved: "#3b82f6",
    };
    const labels: Record<string, string> = {
      pending: "対応待ち",
      answered: "回答済み",
      approved: "承認済み",
    };
    return `<span style="background: ${colors[status] || "#6b7280"}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">${labels[status] || status}</span>`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const questionsHTML = questions.map((q: any) => `
    <div class="question-card ${q.status}">
      <div class="question-header">
        <div class="patient-id">患者ID: ${q.patient_id}</div>
        ${statusBadge(q.status)}
      </div>
      <div class="question-type">${q.question_type_label || q.question_type}</div>
      <div class="question-content">${q.question_content}</div>
      <div class="question-meta">
        <span>質問者: ${q.user_name || q.user_id}</span>
        <span>${formatDate(q.created_at)}</span>
      </div>
      ${q.answers && q.answers.length > 0 ? `
        <div class="answer-section">
          <div class="answer-label">回答:</div>
          ${q.answers.map((a: any) => `
            <div class="answer-content">${a.answer_content}</div>
            <div class="answer-meta">回答者: ${a.answered_by_name || a.answered_by} | ${formatDate(a.created_at)}</div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `).join("");

  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>質問管理 - ${doctorId || "全医師"}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #f3f4f6;
      padding: 16px;
      color: #1f2937;
    }
    .header {
      background: white;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .header h1 {
      font-size: 20px;
      margin-bottom: 12px;
    }
    .stats {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .stat-card {
      background: #f9fafb;
      padding: 12px 16px;
      border-radius: 6px;
      min-width: 100px;
    }
    .stat-card .label {
      font-size: 12px;
      color: #6b7280;
    }
    .stat-card .value {
      font-size: 24px;
      font-weight: bold;
    }
    .stat-card.pending .value { color: #f59e0b; }
    .stat-card.answered .value { color: #10b981; }
    .stat-card.approved .value { color: #3b82f6; }

    .filters {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .filter-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      background: white;
      color: #374151;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .filter-btn:hover {
      background: #f3f4f6;
    }
    .filter-btn.active {
      background: #3b82f6;
      color: white;
    }

    .questions-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .question-card {
      background: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-left: 4px solid #6b7280;
    }
    .question-card.pending { border-left-color: #f59e0b; }
    .question-card.answered { border-left-color: #10b981; }
    .question-card.approved { border-left-color: #3b82f6; }

    .question-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .patient-id {
      font-weight: bold;
      color: #374151;
    }
    .question-type {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    .question-content {
      color: #1f2937;
      line-height: 1.5;
      margin-bottom: 8px;
      white-space: pre-wrap;
    }
    .question-meta {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #9ca3af;
    }
    .answer-section {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
    }
    .answer-label {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 4px;
    }
    .answer-content {
      background: #f0fdf4;
      padding: 8px 12px;
      border-radius: 6px;
      color: #166534;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .answer-meta {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 4px;
    }

    .empty-state {
      text-align: center;
      padding: 40px;
      color: #9ca3af;
    }

    .refresh-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: #3b82f6;
      color: white;
      border: none;
      cursor: pointer;
      font-size: 20px;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    }
    .refresh-btn:hover {
      background: #2563eb;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📋 質問管理${doctorId ? ` - ${doctorId}` : ""}</h1>
    <div class="stats">
      <div class="stat-card">
        <div class="label">合計</div>
        <div class="value">${stats.total}</div>
      </div>
      <div class="stat-card pending">
        <div class="label">対応待ち</div>
        <div class="value">${stats.pending}</div>
      </div>
      <div class="stat-card answered">
        <div class="label">回答済み</div>
        <div class="value">${stats.answered}</div>
      </div>
      <div class="stat-card approved">
        <div class="label">承認済み</div>
        <div class="value">${stats.approved}</div>
      </div>
    </div>
  </div>

  <div class="filters">
    <button class="filter-btn ${statusFilter === "all" ? "active" : ""}" onclick="filterStatus('all')">すべて</button>
    <button class="filter-btn ${statusFilter === "pending" ? "active" : ""}" onclick="filterStatus('pending')">対応待ち</button>
    <button class="filter-btn ${statusFilter === "answered" ? "active" : ""}" onclick="filterStatus('answered')">回答済み</button>
    <button class="filter-btn ${statusFilter === "approved" ? "active" : ""}" onclick="filterStatus('approved')">承認済み</button>
  </div>

  <div class="questions-list">
    ${questionsHTML || '<div class="empty-state">質問がありません</div>'}
  </div>

  <button class="refresh-btn" onclick="location.reload()" title="更新">🔄</button>

  <script>
    function filterStatus(status) {
      const url = new URL(window.location.href);
      url.searchParams.set("status", status);
      window.location.href = url.toString();
    }

    // 30秒ごとに自動更新
    setTimeout(() => location.reload(), 30000);
  </script>
</body>
</html>
`;
}
