import { supabase } from './supabase';

// Local duplicate check: same category within 50 m of the pinned location (no AI involved).
export async function findDuplicates(draft) {
  try {
    if (!draft || !Number.isFinite(draft?.lat) || !Number.isFinite(draft?.lng) || !draft?.category) {
      return null;
    }
    const { data, error } = await supabase.rpc('find_nearby_groups', {
      p_lat: draft.lat,
      p_lng: draft.lng,
      p_category: draft.category,
      p_radius_m: 50,
    });
    if (error || !Array.isArray(data) || data.length === 0 || !data[0]?.id) {
      return null;
    }
    const g = data[0]; // nearest match
    const reportedByMe = Boolean(g.reported_by_me);
    return {
      mergeGroupId: g.id,
      reportedByMe,
      reporterCount: Math.max(0, Number(g.reporter_count || 1) - (reportedByMe ? 1 : 0)),
      status: g.status || 'submitted',
    };
  } catch {
    return null;
  }
}

export async function submitReport(draft) {
  if (!draft || typeof draft !== 'object') {
    throw new Error('Invalid report data provided.');
  }
  if (!draft.imageUrl || typeof draft.imageUrl !== 'string') {
    throw new Error('Photo is required to submit a report.');
  }
  if (!Number.isFinite(draft?.lat) || !Number.isFinite(draft?.lng)) {
    throw new Error('Location is required to submit a report.');
  }
  if (!draft.category || typeof draft.category !== 'string') {
    throw new Error('Category is required to submit a report.');
  }

  const clientRequestId = draft.clientRequestId || crypto.randomUUID();
  const confirmedSeverity = draft.severity || draft.ai?.severity || 'medium';

  const { data: rpcData, error: rpcError } = await supabase.rpc('submit_report', {
    p_client_request_id: clientRequestId,
    p_image_url: draft.imageUrl,
    p_lat: draft.lat,
    p_lng: draft.lng,
    p_address: draft.address || null,
    p_ward: draft.ward || null,
    p_category: draft.category,
    p_severity: confirmedSeverity,
    p_ai_category: draft.ai?.category || null,
    p_ai_severity: draft.ai?.severity || null,
    p_ai_description: draft.ai?.description || null,
    p_ai_confidence: typeof draft.ai?.confidence === 'number' ? draft.ai.confidence : null,
    p_user_corrected: Boolean(draft.userCorrected),
    p_note: draft.note || null,
    p_merge_group_id: draft.mergeGroupId || null,
  });

  if (rpcError) {
    throw new Error(`Submission failed: ${rpcError.message}`);
  }

  const groupId = rpcData?.group_id;
  if (!groupId) {
    throw new Error('Submission failed: No issue group ID was returned.');
  }

  const { data: groupData, error: groupError } = await supabase
    .from('issue_groups_ranked')
    .select('ticket_code, category, severity, address, department_name, status, report_count, reporter_count, priority_score')
    .eq('id', groupId)
    .single();

  if (groupError || !groupData) {
    throw new Error(`Failed to load saved report details: ${groupError?.message || 'View unavailable'}`);
  }

  return {
    reportId: rpcData.report_id,
    groupId,
    ticketCode: groupData.ticket_code,
    category: groupData.category,
    severity: groupData.severity,
    address: groupData.address || draft.address || 'Location provided',
    departmentName: groupData.department_name || 'Municipal Operations',
    status: groupData.status || 'submitted',
    reportCount: Number(groupData.report_count || rpcData.report_count || 1),
    priorityScore: Number(groupData.priority_score || 0),
    reporterCount: Number(rpcData.reporter_count || groupData.reporter_count || 1),
    alreadyReportedByMe: Boolean(rpcData.already_reported_by_me),
    merged: Boolean(rpcData.merged),
    duplicateSubmission: Boolean(rpcData.duplicate_submission),
  };
}
