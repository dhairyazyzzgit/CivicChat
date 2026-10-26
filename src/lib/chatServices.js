import { supabase } from './supabase';

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function findDuplicates(draft, job) {
  try {
    if (!Number.isFinite(draft?.lat) || !Number.isFinite(draft?.lng) || !draft?.category) {
      return null;
    }

    const { data: candidates, error } = await supabase.rpc('find_nearby_groups', {
      p_lat: draft.lat,
      p_lng: draft.lng,
      p_category: draft.category,
      p_radius_m: 50,
    });

    if (error || !Array.isArray(candidates) || candidates.length === 0) {
      return null;
    }

    // Await blobs if needed
    let aiBlob = job?.blobs?.ai;
    if (!aiBlob && job?.blobs && typeof job.blobs.then === 'function') {
      const resolved = await job.blobs;
      aiBlob = resolved?.ai;
    }
    if (!aiBlob) {
      return null;
    }

    const buffer = await aiBlob.arrayBuffer();
    const newImageBase64 = arrayBufferToBase64(buffer);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      return null;
    }

    const testCandidates = candidates.slice(0, 2);

    for (const candidate of testCandidates) {
      if (!candidate.cover_image_url) continue;

      const candidateThumbUrl = candidate.cover_image_url.replace(/\.jpg$/, '_t.jpg');

      try {
        const response = await fetch('/api/compare', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            newImageBase64,
            mimeType: 'image/jpeg',
            candidateImageUrl: candidateThumbUrl,
            category: draft.category,
          }),
        });

        if (!response.ok) {
          continue;
        }

        const compResult = await response.json();
        if (compResult?.same === true && Number(compResult.confidence || 0) >= 0.7) {
          return {
            mergeGroupId: candidate.id,
            reportCount: Number(candidate.report_count || 1),
            coverImageUrl: candidate.cover_image_url,
            status: candidate.status || 'submitted',
          };
        }
      } catch {
        // Continue to next candidate or fallback
        continue;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function submitReport(draft) {
  if (!draft?.imageUrl) {
    throw new Error('Photo is required to submit a report.');
  }
  if (!Number.isFinite(draft?.lat) || !Number.isFinite(draft?.lng)) {
    throw new Error('Location is required to submit a report.');
  }
  if (!draft?.category) {
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
    .select('ticket_code, category, severity, address, department_name, status, report_count, priority_score')
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
    merged: Boolean(rpcData.merged),
    duplicateSubmission: Boolean(rpcData.duplicate_submission),
  };
}
