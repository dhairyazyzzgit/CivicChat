import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { CATEGORIES, CATEGORY_BY_ID, CATEGORY_OPTIONS } from '../lib/categories';
import { findDuplicates, submitReport } from '../lib/chatServices';
import { reverseGeocode } from '../lib/geocode';
import { getBrowserPosition, isValidCoords } from '../lib/location';
import { createPhotoJob } from '../lib/photoJob';
import { supabase } from '../lib/supabase';

const BOT_GREETING =
  "Hi, I'm CivicBot. See something broken in your area, like a pothole, garbage, an open drain or loose wires? Send me a photo and I'll handle the rest.";

const ALL_STATUSES = [
  'IDLE',
  'PROCESSING',
  'LOCATING',
  'CONFIRM_LOCATION',
  'ADJUST_LOCATION',
  'WAIT_AI',
  'CONFIRM_CATEGORY',
  'PICK_CATEGORY',
  'AWAIT_DESCRIPTION',
  'AWAIT_NOTE',
  'CHECKING_DUPLICATES',
  'SUBMITTING',
  'DONE',
  'ERROR',
];

const TRANSITIONS = {
  APPEND_MESSAGE: ALL_STATUSES,
  UPDATE_MESSAGE: ALL_STATUSES,
  SET_STATUS: ALL_STATUSES,
  SET_INTERACTION: ALL_STATUSES,
  SET_BUSY: ALL_STATUSES,
  SET_ERROR: ALL_STATUSES,
  CLEAR_ERROR: ALL_STATUSES,
  SET_DRAFT: ALL_STATUSES,
  SET_JOB_ID: ALL_STATUSES,
  RESET: ALL_STATUSES,
};

// Dev-only assertion at module load that every dispatched action type appears in the table
if (import.meta.env.DEV) {
  const DISPATCHED_TYPES = [
    'APPEND_MESSAGE',
    'UPDATE_MESSAGE',
    'SET_STATUS',
    'SET_INTERACTION',
    'SET_BUSY',
    'SET_ERROR',
    'CLEAR_ERROR',
    'SET_DRAFT',
    'SET_JOB_ID',
    'RESET',
  ];
  DISPATCHED_TYPES.forEach((type) => {
    if (!TRANSITIONS[type]) {
      console.warn(`[useChatFlow] Missing TRANSITIONS entry for dispatched action type: ${type}`);
    }
  });
}

const CHAT_STORAGE_KEY = 'civicchat:active_chat_state';

function createFreshDraft() {
  return {
    clientRequestId: crypto.randomUUID(),
    imageUrl: '',
    lat: null,
    lng: null,
    address: '',
    ward: null,
    source: null,
    accuracy: 20,
    category: null,
    severity: 'medium',
    userCorrected: false,
    note: '',
    ai: null,
    mergeGroupId: null,
  };
}

function createInitialState() {
  try {
    if (typeof window !== 'undefined') {
      const saved = window.sessionStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          return {
            status: parsed.status || 'IDLE',
            messages: parsed.messages,
            interaction: parsed.interaction || null,
            busy: false,
            error: null,
            draft: parsed.draft || createFreshDraft(),
            jobId: parsed.jobId || null,
          };
        }
      }
    }
  } catch {
    // Ignore storage issues
  }

  return {
    status: 'IDLE',
    messages: [{ id: 'greeting-msg', role: 'bot', type: 'text', text: BOT_GREETING }],
    interaction: null,
    busy: false,
    error: null,
    draft: createFreshDraft(),
    jobId: null,
  };
}

function reducer(state, action) {
  const allowed = TRANSITIONS[action.type];
  if (!allowed) {
    if (import.meta.env.DEV) {
      console.warn(`[useChatFlow] Unknown action type: ${action.type}`);
    }
    return state;
  }

  if (!allowed.includes(state.status)) {
    if (import.meta.env.DEV) {
      console.warn(`[useChatFlow] Action ${action.type} is not allowed in status ${state.status}`);
    }
    return state;
  }

  switch (action.type) {
    case 'APPEND_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map((m) => (m.id === action.id ? { ...m, ...action.patch } : m)),
      };

    case 'SET_STATUS':
      return { ...state, status: action.status };

    case 'SET_INTERACTION':
      return { ...state, interaction: action.interaction };

    case 'SET_BUSY':
      return { ...state, busy: Boolean(action.busy) };

    case 'SET_ERROR':
      return {
        ...state,
        error: { text: action.text, retryAction: action.retryAction || null },
        busy: false,
      };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    case 'SET_DRAFT':
      return { ...state, draft: { ...state.draft, ...action.patch } };

    case 'SET_JOB_ID':
      return { ...state, jobId: action.value };

    case 'RESET':
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(CHAT_STORAGE_KEY);
        }
      } catch {}
      return {
        status: 'IDLE',
        messages: [{ id: 'greeting-msg', role: 'bot', type: 'text', text: BOT_GREETING }],
        interaction: null,
        busy: false,
        error: null,
        draft: createFreshDraft(),
        jobId: null,
      };

    default:
      return state;
  }
}

export function useChatFlow() {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, null, createInitialState);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');

  const jobRef = useRef(null);
  const queueRef = useRef(Promise.resolve());
  const interactionLockRef = useRef(new Set());
  const photoMsgIdRef = useRef(null);

  // Synchronized draft ref to always read latest values in async tasks
  const draftRef = useRef(state.draft);
  useEffect(() => {
    draftRef.current = state.draft;
  }, [state.draft]);

  // Persist chat across tab/route switches
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        if (state.messages.length > 1 || state.status !== 'IDLE') {
          window.sessionStorage.setItem(
            CHAT_STORAGE_KEY,
            JSON.stringify({
              status: state.status,
              messages: state.messages,
              interaction: state.interaction,
              draft: state.draft,
              jobId: state.jobId,
            }),
          );
        }
      }
    } catch {
      // Ignore
    }
  }, [state.status, state.messages, state.interaction, state.draft, state.jobId]);

  // Queue helper: enqueue sequential bot messages with typing indicator (400-700 ms)
  const say = useCallback((text) => {
    return new Promise((resolve) => {
      queueRef.current = queueRef.current
        .then(async () => {
          setTyping(true);
          const delay = 450 + Math.floor(Math.random() * 200);
          await new Promise((r) => setTimeout(r, delay));
          setTyping(false);
          const msg = {
            id: crypto.randomUUID(),
            role: 'bot',
            type: 'text',
            text,
          };
          dispatch({ type: 'APPEND_MESSAGE', message: msg });
        })
        .then(resolve)
        .catch(() => {
          setTyping(false);
          resolve();
        });
    });
  }, []);

  // Duplicate check and report submission runner
  const runSubmitFlow = useCallback(
    async (currentDraft) => {
      dispatch({ type: 'SET_BUSY', busy: true });

      // Ensure upload has completed
      const job = jobRef.current;
      if (!job || job.dead) {
        dispatch({ type: 'SET_BUSY', busy: false });
        return;
      }

      let imageUrl = currentDraft.imageUrl;
      if (!imageUrl) {
        const uploadRes = await job.upload;
        if (uploadRes.status !== 'ok') {
          dispatch({
            type: 'SET_ERROR',
            text: uploadRes.message || 'Photo upload failed. Please tap Retry.',
            retryAction: 'upload',
          });
          dispatch({ type: 'SET_STATUS', status: 'ERROR' });
          return;
        }
        imageUrl = uploadRes.mainUrl;
        dispatch({ type: 'SET_DRAFT', patch: { imageUrl } });
        currentDraft.imageUrl = imageUrl;
      }

      // Checking duplicates step
      dispatch({ type: 'SET_STATUS', status: 'CHECKING_DUPLICATES' });
      await say('Checking if this was already reported nearby...');

      let mergeGroupId = currentDraft.mergeGroupId;
      try {
        const dupResult = await findDuplicates(currentDraft, job);
        if (dupResult?.mergeGroupId) {
          mergeGroupId = dupResult.mergeGroupId;
          dispatch({ type: 'SET_DRAFT', patch: { mergeGroupId } });
          currentDraft.mergeGroupId = mergeGroupId;
          await say("This spot was already reported. I'll add your report to it so it gets more attention.");
        }
      } catch {
        // If duplicate comparison fails, continue creating normal report
      }

      // Submit step
      dispatch({ type: 'SET_STATUS', status: 'SUBMITTING' });

      try {
        const report = await submitReport(currentDraft);
        dispatch({ type: 'SET_STATUS', status: 'DONE' });
        dispatch({ type: 'SET_BUSY', busy: false });

        // Append confirmation card message
        const confirmMsg = {
          id: crypto.randomUUID(),
          role: 'bot',
          type: 'confirmation',
          reportCode: report.ticketCode,
          category: report.category,
          severity: report.severity,
          address: report.address,
          department: report.departmentName,
          status: report.status,
          reportId: report.reportId,
        };
        dispatch({ type: 'APPEND_MESSAGE', message: confirmMsg });

        const confirmText = report.merged
          ? `${report.reportCount - 1} other people already reported this spot, so I added yours to the same issue. More reports means higher priority.`
          : `Done! I've sent this to ${report.departmentName}. I'll update you when the status changes.`;
        await say(confirmText);
      } catch (err) {
        dispatch({
          type: 'SET_ERROR',
          text: err?.message || 'Submission failed. Tap Retry to try again.',
          retryAction: 'submit',
        });
        dispatch({ type: 'SET_STATUS', status: 'ERROR' });
      }
    },
    [say],
  );

  // Present AI analysis result (after location is confirmed)
  const presentAiAnalysis = useCallback(
    async (job) => {
      dispatch({ type: 'SET_STATUS', status: 'WAIT_AI' });

      // Check if analysis is already resolved
      let analysisRes = null;
      let isReady = false;

      // Quick probe
      const probe = Promise.race([
        job.analysis.then((res) => {
          isReady = true;
          return res;
        }),
        new Promise((r) => setTimeout(() => r('pending'), 100)),
      ]);

      const probeRes = await probe;
      if (isReady && probeRes !== 'pending') {
        analysisRes = probeRes;
      } else {
        await say('Looking at your photo...');
        analysisRes = await job.analysis;
      }

      if (!jobRef.current || jobRef.current.id !== job.id || job.dead) {
        return;
      }

      // Case A: Not a civic issue
      if (analysisRes?.status === 'manual' && analysisRes?.reason === 'not_civic') {
        await say("This doesn't look like a public civic issue. Want to try another photo?");
        job.abort();
        jobRef.current = null;
        dispatch({ type: 'SET_STATUS', status: 'IDLE' });
        dispatch({ type: 'SET_BUSY', busy: false });
        return;
      }

      // Case B: AI busy / limit / error
      if (analysisRes?.status === 'manual') {
        await say("I couldn't analyse the photo right now, so please pick the category yourself.");
        dispatch({ type: 'SET_STATUS', status: 'PICK_CATEGORY' });
        dispatch({
          type: 'SET_INTERACTION',
          interaction: {
            id: crypto.randomUUID(),
            kind: 'chips',
            options: CATEGORY_OPTIONS.map((c) => ({ id: c.id, label: `${c.icon} ${c.label}` })),
          },
        });
        dispatch({ type: 'SET_BUSY', busy: false });
        return;
      }

      // Case C: Success
      const ai = analysisRes.result;
      dispatch({ type: 'SET_DRAFT', patch: { ai } });

      const confidence = Number(ai.confidence || 0);
      const matchedCat = CATEGORY_BY_ID[ai.category] || CATEGORY_OPTIONS[0];

      if (confidence < 0.6) {
        // Low confidence: offer top match + alternatives + something else
        await say("I'm not fully sure. Is it one of these?");
        const otherOptions = CATEGORY_OPTIONS.filter((c) => c.id !== matchedCat.id).slice(0, 2);
        const options = [
          { id: matchedCat.id, label: `${matchedCat.icon} ${matchedCat.label}` },
          ...otherOptions.map((c) => ({ id: c.id, label: `${c.icon} ${c.label}` })),
          { id: 'other', label: '📌 Something else' },
        ];
        dispatch({ type: 'SET_STATUS', status: 'CONFIRM_CATEGORY' });
        dispatch({
          type: 'SET_INTERACTION',
          interaction: {
            id: crypto.randomUUID(),
            kind: 'chips',
            options,
          },
        });
      } else {
        // High confidence: confirm / something else / describe
        await say(`This looks like a **${matchedCat.label}** (${Math.round(confidence * 100)}% match).`);
        dispatch({ type: 'SET_STATUS', status: 'CONFIRM_CATEGORY' });
        dispatch({
          type: 'SET_INTERACTION',
          interaction: {
            id: crypto.randomUUID(),
            kind: 'chips',
            options: [
              { id: 'confirm', label: "Yes, that's right" },
              { id: 'other', label: "No, it's something else" },
              { id: 'describe', label: 'Let me describe it' },
            ],
          },
        });
      }

      dispatch({ type: 'SET_BUSY', busy: false });
    },
    [say],
  );

  // Location resolve flow: Photo EXIF -> Browser Geolocation -> Manual Pin
  const resolveLocation = useCallback(
    async (job) => {
      dispatch({ type: 'SET_STATUS', status: 'LOCATING' });
      dispatch({ type: 'SET_BUSY', busy: true });

      // 1. Check Photo EXIF GPS
      let exifGps = null;
      try {
        exifGps = await job.exif;
      } catch {
        exifGps = null;
      }

      if (job.dead) return;

      if (exifGps && isValidCoords(exifGps.lat, exifGps.lng)) {
        const geo = await reverseGeocode(exifGps.lat, exifGps.lng);
        if (job.dead) return;

        dispatch({ type: 'SET_STATUS', status: 'CONFIRM_LOCATION' });
        dispatch({
          type: 'SET_INTERACTION',
          interaction: {
            id: crypto.randomUUID(),
            kind: 'location',
            latitude: exifGps.lat,
            longitude: exifGps.lng,
            address: geo.address,
            ward: geo.ward,
            source: 'photo',
            accuracy: 15,
            manualMode: false,
          },
        });
        dispatch({ type: 'SET_BUSY', busy: false });
        return;
      }

      // 2. Request Browser Geolocation
      await say('I need your location so the right team can find this spot. Please allow location access.');
      if (job.dead) return;

      try {
        const pos = await getBrowserPosition();
        if (job.dead) return;

        const geo = await reverseGeocode(pos.lat, pos.lng);
        if (job.dead) return;

        dispatch({ type: 'SET_STATUS', status: 'CONFIRM_LOCATION' });
        dispatch({
          type: 'SET_INTERACTION',
          interaction: {
            id: crypto.randomUUID(),
            kind: 'location',
            latitude: pos.lat,
            longitude: pos.lng,
            address: geo.address,
            ward: geo.ward,
            source: 'gps',
            accuracy: pos.accuracy,
            manualMode: false,
          },
        });
      } catch {
        // 3. Fallback to Manual Pin
        if (job.dead) return;
        await say("I couldn't detect your location automatically. Please tap your location on the map.");

        dispatch({ type: 'SET_STATUS', status: 'CONFIRM_LOCATION' });
        dispatch({
          type: 'SET_INTERACTION',
          interaction: {
            id: crypto.randomUUID(),
            kind: 'location',
            latitude: null,
            longitude: null,
            address: '',
            ward: null,
            source: 'manual',
            accuracy: 50,
            manualMode: true,
          },
        });
      }

      dispatch({ type: 'SET_BUSY', busy: false });
    },
    [say],
  );

  // File pick handler: Starts photo job synchronously
  const handlePhotoSelect = useCallback(
    async (file) => {
      if (!file) return;

      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
      if (!validTypes.includes(file.type || '')) {
        dispatch({
          type: 'SET_ERROR',
          text: 'Please upload a photo in JPG, PNG, or WebP format.',
          retryAction: null,
        });
        return;
      }

      if (file.size > 15 * 1024 * 1024) {
        dispatch({
          type: 'SET_ERROR',
          text: 'Photo is too large. Please select a photo up to 15 MB.',
          retryAction: null,
        });
        return;
      }

      if (jobRef.current && !jobRef.current.dead && state.status !== 'IDLE' && state.status !== 'DONE') {
        return;
      }

      // Clear any prior errors
      dispatch({ type: 'CLEAR_ERROR' });

      // Start job synchronously
      const job = createPhotoJob(file, {
        userId: user?.id || '',
        getAccessToken: async () => {
          const { data } = await supabase.auth.getSession();
          if (data?.session?.access_token) {
            return data.session.access_token;
          }
          const { data: refreshed } = await supabase.auth.refreshSession();
          return refreshed?.session?.access_token || '';
        },
      });

      jobRef.current = job;
      dispatch({ type: 'SET_JOB_ID', value: job.id });

      // Append photo message synchronously
      const photoMsgId = crypto.randomUUID();
      photoMsgIdRef.current = photoMsgId;

      dispatch({
        type: 'APPEND_MESSAGE',
        message: {
          id: photoMsgId,
          role: 'user',
          type: 'image',
          imageUrl: job.objectUrl,
          uploadStatus: 'uploading',
        },
      });

      // Hook upload progress to update photo message
      job.upload.then((res) => {
        if (jobRef.current?.id !== job.id || job.dead) return;
        if (res.status === 'ok') {
          dispatch({
            type: 'UPDATE_MESSAGE',
            id: photoMsgId,
            patch: { uploadStatus: 'uploaded' },
          });
          dispatch({ type: 'SET_DRAFT', patch: { imageUrl: res.mainUrl } });
        } else {
          dispatch({
            type: 'UPDATE_MESSAGE',
            id: photoMsgId,
            patch: { uploadStatus: 'failed' },
          });
        }
      });

      // Say initial bot acknowledgment
      await say('Got it! Let me find where this is.');

      // Proceed to Location resolution
      await resolveLocation(job);
    },
    [say, resolveLocation, state.status],
  );

  // Map confirmation handler
  const handleLocationConfirm = useCallback(
    async (loc) => {
      const lockKey = `loc:${loc.lat},${loc.lng}`;
      if (interactionLockRef.current.has(lockKey)) return;
      interactionLockRef.current.add(lockKey);

      // Clear interaction
      dispatch({ type: 'SET_INTERACTION', interaction: null });

      // Update draft
      const patch = {
        lat: loc.lat,
        lng: loc.lng,
        address: loc.address,
        ward: loc.ward,
        source: loc.source,
      };
      dispatch({ type: 'SET_DRAFT', patch });

      // Append static location summary message
      dispatch({
        type: 'APPEND_MESSAGE',
        message: {
          id: crypto.randomUUID(),
          role: 'bot',
          type: 'text',
          text: `📍 Pinned at **${loc.address}**`,
        },
      });

      // Present AI analysis now that location is confirmed
      if (jobRef.current) {
        await presentAiAnalysis(jobRef.current);
      }
    },
    [presentAiAnalysis],
  );

  // Prompt note step
  const promptNoteStep = useCallback(
    async (category) => {
      dispatch({ type: 'SET_STATUS', status: 'AWAIT_NOTE' });
      await say('Would you like to add an extra note or landmark?');

      dispatch({
        type: 'SET_INTERACTION',
        interaction: {
          id: crypto.randomUUID(),
          kind: 'chips',
          options: [
            { id: 'skip_note', label: 'No, submit' },
            { id: 'add_note', label: 'Add a note' },
          ],
        },
      });
      dispatch({ type: 'SET_BUSY', busy: false });
    },
    [say],
  );

  // Chip selection handler
  const handleChipSelect = useCallback(
    async (chipId, chipLabel) => {
      const interactionId = state.interaction?.id || 'default';
      const lockKey = `${interactionId}:${chipId}`;
      if (interactionLockRef.current.has(lockKey)) return;
      interactionLockRef.current.add(lockKey);

      // Clear interaction
      dispatch({ type: 'SET_INTERACTION', interaction: null });

      // 1. Confirm AI suggested category
      if (chipId === 'confirm') {
        dispatch({
          type: 'APPEND_MESSAGE',
          message: { id: crypto.randomUUID(), role: 'user', type: 'text', text: "Yes, that's right" },
        });

        const category = state.draft.ai?.category || 'pothole';
        const severity = state.draft.ai?.severity || 'medium';
        dispatch({ type: 'SET_DRAFT', patch: { category, severity } });

        await promptNoteStep(category);
        return;
      }

      // 2. User chooses "No, it's something else" or "Something else"
      if (chipId === 'other') {
        dispatch({
          type: 'APPEND_MESSAGE',
          message: { id: crypto.randomUUID(), role: 'user', type: 'text', text: "No, it's something else" },
        });
        dispatch({ type: 'SET_DRAFT', patch: { userCorrected: true } });

        await say('Which category best fits this issue?');
        dispatch({ type: 'SET_STATUS', status: 'PICK_CATEGORY' });
        dispatch({
          type: 'SET_INTERACTION',
          interaction: {
            id: crypto.randomUUID(),
            kind: 'chips',
            options: CATEGORY_OPTIONS.map((c) => ({ id: c.id, label: `${c.icon} ${c.label}` })),
          },
        });
        return;
      }

      // 3. User chooses "Let me describe it"
      if (chipId === 'describe') {
        dispatch({
          type: 'APPEND_MESSAGE',
          message: { id: crypto.randomUUID(), role: 'user', type: 'text', text: 'Let me describe it' },
        });
        dispatch({ type: 'SET_DRAFT', patch: { userCorrected: true } });

        await say('Please describe the issue in the message box below.');
        dispatch({ type: 'SET_STATUS', status: 'AWAIT_DESCRIPTION' });
        return;
      }

      // 4. Note step choices
      if (chipId === 'skip_note') {
        dispatch({
          type: 'APPEND_MESSAGE',
          message: { id: crypto.randomUUID(), role: 'user', type: 'text', text: 'No, submit' },
        });
        await runSubmitFlow({ ...draftRef.current });
        return;
      }

      if (chipId === 'add_note') {
        dispatch({
          type: 'APPEND_MESSAGE',
          message: { id: crypto.randomUUID(), role: 'user', type: 'text', text: 'Add a note' },
        });
        await say('Type your note below (up to 500 characters).');
        dispatch({ type: 'SET_STATUS', status: 'AWAIT_NOTE' });
        return;
      }

      // 5. Specific category selection from chips
      const cat = CATEGORY_BY_ID[chipId];
      if (cat) {
        dispatch({
          type: 'APPEND_MESSAGE',
          message: { id: crypto.randomUUID(), role: 'user', type: 'text', text: cat.label },
        });
        dispatch({
          type: 'SET_DRAFT',
          patch: { category: cat.id, severity: cat.severity, userCorrected: true },
        });
        await promptNoteStep(cat.id);
      }
    },
    [state.interaction, state.draft.ai, promptNoteStep, say, runSubmitFlow],
  );

  // User text input handler (for describe and note steps)
  const handleUserText = useCallback(
    async (text) => {
      const trimmed = String(text || '').trim();
      if (!trimmed) return;

      // Append user text message
      dispatch({
        type: 'APPEND_MESSAGE',
        message: { id: crypto.randomUUID(), role: 'user', type: 'text', text: trimmed },
      });
      setInput('');

      // If waiting for description of issue
      if (state.status === 'AWAIT_DESCRIPTION') {
        dispatch({ type: 'SET_BUSY', busy: true });
        await say('Analyzing your description...');

        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token || '';

          const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ userText: trimmed }),
          });

          if (!res.ok) {
            throw new Error('Analysis failed.');
          }

          const aiResult = await res.json();
          dispatch({ type: 'SET_DRAFT', patch: { ai: aiResult } });

          const cat = CATEGORY_BY_ID[aiResult.category] || CATEGORY_OPTIONS[0];
          await say(`Based on your description, this looks like a **${cat.label}**.`);

          dispatch({ type: 'SET_STATUS', status: 'CONFIRM_CATEGORY' });
          dispatch({
            type: 'SET_INTERACTION',
            interaction: {
              id: crypto.randomUUID(),
              kind: 'chips',
              options: [
                { id: 'confirm', label: "Yes, that's right" },
                { id: 'other', label: "No, it's something else" },
              ],
            },
          });
        } catch {
          await say("I couldn't classify that description. Please select the category below.");
          dispatch({ type: 'SET_STATUS', status: 'PICK_CATEGORY' });
          dispatch({
            type: 'SET_INTERACTION',
            interaction: {
              id: crypto.randomUUID(),
              kind: 'chips',
              options: CATEGORY_OPTIONS.map((c) => ({ id: c.id, label: `${c.icon} ${c.label}` })),
            },
          });
        } finally {
          dispatch({ type: 'SET_BUSY', busy: false });
        }
        return;
      }

      // If waiting for note
      if (state.status === 'AWAIT_NOTE') {
        const note = trimmed.slice(0, 500);
        dispatch({ type: 'SET_DRAFT', patch: { note } });
        await say('Note added!');
        await runSubmitFlow({ ...draftRef.current, note });
      }
    },
    [state.status, say, runSubmitFlow],
  );

  // Retry handler: Never starts a second job; re-enters the failed step
  const retry = useCallback(async () => {
    const action = state.error?.retryAction;
    dispatch({ type: 'CLEAR_ERROR' });

    if (action === 'upload') {
      if (photoMsgIdRef.current) {
        dispatch({
          type: 'UPDATE_MESSAGE',
          id: photoMsgIdRef.current,
          patch: { uploadStatus: 'uploading' },
        });
      }
      if (jobRef.current) {
        const uploadRes = await jobRef.current.retryUpload();
        if (uploadRes.status === 'ok') {
          if (photoMsgIdRef.current) {
            dispatch({
              type: 'UPDATE_MESSAGE',
              id: photoMsgIdRef.current,
              patch: { uploadStatus: 'uploaded' },
            });
          }
          dispatch({ type: 'SET_DRAFT', patch: { imageUrl: uploadRes.mainUrl } });
          // If stopped during duplicate/submit flow, resume it
          if (state.draft.category && state.draft.lat) {
            await runSubmitFlow({ ...draftRef.current, imageUrl: uploadRes.mainUrl });
          }
        } else {
          if (photoMsgIdRef.current) {
            dispatch({
              type: 'UPDATE_MESSAGE',
              id: photoMsgIdRef.current,
              patch: { uploadStatus: 'failed' },
            });
          }
          dispatch({
            type: 'SET_ERROR',
            text: uploadRes.message || 'Photo upload failed. Please tap Retry.',
            retryAction: 'upload',
          });
        }
      }
      return;
    }

    if (action === 'submit') {
      await runSubmitFlow({ ...draftRef.current });
    }
  }, [state.error, state.draft, runSubmitFlow]);

  // Reset / New report handler
  const reset = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(CHAT_STORAGE_KEY);
      }
    } catch {
      // Ignore
    }
    jobRef.current?.abort?.();
    jobRef.current = null;
    queueRef.current = Promise.resolve();
    interactionLockRef.current.clear();
    setTyping(false);
    setInput('');
    dispatch({ type: 'RESET' });
  }, []);

  const isBusy = state.busy || typing;

  return {
    status: state.status,
    messages: state.messages,
    interaction: state.interaction,
    error: state.error,
    busy: isBusy,
    typing,
    draft: state.draft,
    input,
    setInput,
    canSend: input.trim().length > 0 && !isBusy,
    handlePhotoSelect,
    handleLocationConfirm,
    handleChipSelect,
    handleUserText,
    retry,
    reset,
  };
}
