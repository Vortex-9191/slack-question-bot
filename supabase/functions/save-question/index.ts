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

    const body = await req.json();
    const { action } = body;

    // 質問を保存
    if (action === "save_question") {
      const {
        questionId,
        patientId,
        questionType,
        questionTypeLabel,
        doctorName,
        doctorId,
        questionContent,
        userId,
        userName,
        originalChannelId,
        originalMessageTs,
        doctorChannelId,
      } = body;

      const { data, error } = await supabase
        .from("questions")
        .upsert({
          question_id: questionId,
          patient_id: patientId,
          question_type: questionType,
          question_type_label: questionTypeLabel,
          doctor_name: doctorName,
          doctor_id: doctorId,
          question_content: questionContent,
          user_id: userId,
          user_name: userName,
          original_channel_id: originalChannelId,
          original_message_ts: originalMessageTs,
          doctor_channel_id: doctorChannelId,
          status: "pending",
          updated_at: new Date().toISOString(),
        }, { onConflict: "question_id" })
        .select();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 回答を保存
    if (action === "save_answer") {
      const { questionId, answerContent, answeredBy, answeredByName } = body;

      // 回答を保存
      const { data: answerData, error: answerError } = await supabase
        .from("answers")
        .insert({
          question_id: questionId,
          answer_content: answerContent,
          answered_by: answeredBy,
          answered_by_name: answeredByName,
        })
        .select();

      if (answerError) throw answerError;

      // 質問のステータスを更新
      const { error: updateError } = await supabase
        .from("questions")
        .update({ status: "answered", updated_at: new Date().toISOString() })
        .eq("question_id", questionId);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true, data: answerData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ステータスを更新（承認など）
    if (action === "update_status") {
      const { questionId, status } = body;

      const { data, error } = await supabase
        .from("questions")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("question_id", questionId)
        .select();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 質問一覧を取得
    if (action === "get_questions") {
      const { doctorId, status, limit = 50 } = body;

      let query = supabase
        .from("questions")
        .select("*, answers(*)")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (doctorId) query = query.eq("doctor_id", doctorId);
      if (status) query = query.eq("status", status);

      const { data, error } = await query;

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
