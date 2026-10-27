import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { CATEGORIES, CATEGORY_BY_ID, CATEGORY_OPTIONS } from '../lib/categories';
import { findDuplicates, submitReport } from '../lib/chatServices';
import { reverseGeocode } from '../lib/geocode';
import { validateImageFile } from '../lib/imageFile';
import { acquireBrowserPosition, isValidCoords } from '../lib/location';
import { clearPhoto, loadPhoto, storePhoto } from '../lib/chatPhotoStore';
import { createPhotoJob } from '../lib/photoJob';
import { supabase } from '../lib/supabase';
import { MAX_SOURCE_IMAGE_BYTES, sourceImageTooLargeMessage } from '../lib/uploadLimits';

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

const CHAT_STORAGE_KEY = 'civicchat:active_chat_state:v2';
const CHAT_TTL_MS = 12 * 60 * 60 * 1000; // an unfinished report is kept for 12 hours

function clearSavedChat() {
  try {
    window.localStorage.removeItem(CHAT_STORAGE_KEY);
    window.sessionStorage.removeItem('civicchat:active_chat_state');
  } catch {
    // Ignore
  }
  clearPhoto();
}

// A job rebuilt from already-finished work (photo uploaded, AI result known)
function createResumedJob(imageUrl, ai) {
  let dead = false;
  const done = { status: 'ok', mainUrl: imageUrl };
  return {
    id: crypto.randomUUID(),
    objectUrl: imageUrl,
    exif: Promise.resolve(null),
    upload: Promise.resolve(done),
    analysis: Promise.resolve(ai ? { status: 'ok', result: ai } : { status: 'manual', reason: 'error' }),
    abort() {
      dead = true;
    },
    retryUpload: () => Promise.resolve(done),
    get dead() {
      return dead;
    },
  };
}

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

function createInitialState(uid) {
  try {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const fresh = parsed && Date.now() - Number(parsed.savedAt || 0) < CHAT_TTL_MS;
        if (uid && fresh && parsed.uid === uid && Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          return {
            status: parsed.status || 'IDLE',
            messages: parsed.messages,
            interaction: parsed.interaction || null,
            busy: false,
            error: parsed.status === 'ERROR' ? parsed.error || null : null,
            draft: { ...createFreshDraft(), ...(parsed.draft || {}) },
            jobId: null,
          };
        }
        window.localStorage.removeItem(CHAT_STORAGE_KEY);
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
      clearSavedChat();
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
  const [state, dispatch] = useReducer(reducer, user?.id || null, createInitialState);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');

  const jobRef = useRef(null);
  const queueRef = useRef(Promise.resolve());
  const interactionLockRef = useRef(new Set());
  const photoMsgIdRef = useRef(null);
  const locationRequestRef = useRef(0);

  // Synchronized draft ref to always read latest values in async tasks
  const draftRef = useRef(state.draft);
  useEffect(() => {
    draftRef.current = state.draft;
  }, [state.draft]);

  // A different account on the same device must never inherit the previous chat
  const lastUidRef = useRef(user?.id || null);
  useEffect(() => {
    const uid = user?.id || null;
    if (lastUidRef.current !== uid) {
      lastUidRef.current = uid;
      jobRef.current?.abort?.();
      jobRef.current = null;
      queueRef.current = Promise.resolve();
      interactionLockRef.current.clear();
      setTyping(false);
      setInput('');
      dispatch({ type: 'RESET' });
    }
  }, [user?.id]);

  // Persist the in-progress report so it survives route changes, reloads and closing the browser
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      if (state.status === 'DONE') {
        clearSavedChat();
        return;
      }
      if (state.messages.length > 1 || state.status !== 'IDLE') {
        const messages = state.messages.map((m) =>
          m.type === 'image' && typeof m.imageUrl === 'string' && m.imageUrl.startsWith('blob:')
            ? { ...m, imageUrl: state.draft.imageUrl || '' }
            : m,
        );
        window.localStorage.setItem(
          CHAT_STORAGE_KEY,
          JSON.stringify({
            uid: user?.id || null,
            savedAt: Date.now(),
            status: state.status,
            messages,
            interaction: state.interaction,
            error: state.error,
            draft: state.draft,
          }),
        );
      }
    } catch {
      // Ignore
    }
  }, [user?.id, state.status, state.messages, state.interaction, state.draft, state.error]);

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
          if (dupResult.reportedByMe) {
            await say("You've already reported this issue here. I'll link this to your existing ticket without raising its priority again.");
          } else {
            const n = Math.max(1, dupResult.reporterCount);
            await say(`This issue was already reported by ${n} other ${n === 1 ? 'person' : 'people'}. I'll add your report to it so it gets more attention.`);
          }
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

        const others = Math.max(0, report.reporterCount - 1);
        const confirmText = report.alreadyReportedByMe
          ? `Your new photo is saved under ticket ${report.ticketCode}. Priority stays the same since you already reported this spot.`
          : report.merged
            ? `${others} other ${others === 1 ? 'person' : 'people'} already reported this spot, so I added yours to the same issue. More reports means higher priority.`
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

  const openManualLocation = useCallback(async (job, message) => {
    if (job?.dead) return;
    if (message) await say(message);
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
    dispatch({ type: 'SET_BUSY', busy: false });
  }, [say]);

  // Location resolve flow: Photo EXIF -> Browser Geolocation -> Manual Pin
  const resolveLocation = useCallback(
    async (job) => {
      const requestId = ++locationRequestRef.current;
      dispatch({ type: 'SET_STATUS', status: 'LOCATING' });
      dispatch({ type: 'SET_BUSY', busy: true });
      dispatch({
        type: 'SET_INTERACTION',
        interaction: { id: crypto.randomUUID(), kind: 'locating', phase: 'initializing' },
      });

      let exifGps = null;
      try {
        exifGps = await job.exif;
      } catch {
        exifGps = null;
      }

      if (job.dead || requestId !== locationRequestRef.current) return;

      if (exifGps && isValidCoords(exifGps.lat, exifGps.lng)) {
        const geo = await reverseGeocode(exifGps.lat, exifGps.lng);
        if (job.dead || requestId !== locationRequestRef.current) return;

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

      await say('I need your location so the right team can find this spot.');
      if (job.dead || requestId !== locationRequestRef.current) return;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 22_000);

      try {
        const pos = await acquireBrowserPosition({
          signal: controller.signal,
          onState: (phase) => {
            if (requestId !== locationRequestRef.current) return;
            dispatch({
              type: 'SET_INTERACTION',
              interaction: { id: `locating-${requestId}`, kind: 'locating', phase },
            });
          },
        });
        clearTimeout(timeout);
        if (job.dead || requestId !== locationRequestRef.current) return;

        const geo = await reverseGeocode(pos.lat, pos.lng);
        if (job.dead || requestId !== locationRequestRef.current) return;

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
      } catch (err) {
        clearTimeout(timeout);
        if (job.dead || requestId !== locationRequestRef.current) return;
        const code = err?.code || 'unavailable';
        dispatch({
          type: 'SET_INTERACTION',
          interaction: { id: `locating-${requestId}`, kind: 'locating', phase: code },
        });
        dispatch({ type: 'SET_BUSY', busy: false });
        return;
      }

      dispatch({ type: 'SET_BUSY', busy: false });
    },
    [say],
  );

  // Reflect a job's upload result in the photo message and the draft
  const wireJob = useCallback((job, photoMsgId) => {
    photoMsgIdRef.current = photoMsgId;
    job.upload.then((res) => {
      if (jobRef.current?.id !== job.id || job.dead) return;
      if (res.status === 'ok') {
        dispatch({ type: 'UPDATE_MESSAGE', id: photoMsgId, patch: { uploadStatus: 'uploaded' } });
        dispatch({ type: 'SET_DRAFT', patch: { imageUrl: res.mainUrl } });
      } else {
        dispatch({ type: 'UPDATE_MESSAGE', id: photoMsgId, patch: { uploadStatus: 'failed' } });
      }
    });
  }, []);

  // File pick handler: Starts photo job synchronously
  const handlePhotoSelect = useCallback(
    async (file) => {
      if (!file) return;

      const validation = await validateImageFile(file);
      if (!validation.ok) {
        dispatch({
          type: 'SET_ERROR',
          text: validation.message,
          retryAction: null,
        });
        return;
      }

      if (file.size > MAX_SOURCE_IMAGE_BYTES) {
        dispatch({
          type: 'SET_ERROR',
          text: sourceImageTooLargeMessage(),
          retryAction: null,
        });
        return;
      }

      if (jobRef.current && !jobRef.current.dead && state.status !== 'IDLE' && state.status !== 'DONE') {
        return;
      }

      // Clear any prior errors
      dispatch({ type: 'CLEAR_ERROR' });

      let job;
      try {
        job = createPhotoJob(file, {
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
      } catch (err) {
        dispatch({
          type: 'SET_ERROR',
          text: err?.message || 'Could not use that photo. Please choose another.',
          retryAction: null,
        });
        return;
      }

      jobRef.current = job;
      // New photo = clean draft (no stale image, location, category, note or request id)
      dispatch({ type: 'SET_DRAFT', patch: createFreshDraft() });
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

      storePhoto(file, user?.id);
      wireJob(job, photoMsgId);

      // Say initial bot acknowledgment
      await say('Got it! Let me find where this is.');

      // Proceed to Location resolution
      await resolveLocation(job);
    },
    [say, resolveLocation, wireJob, state.status, user?.id],
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
            { id: 'skip_note', label: 'Submit report' },
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
          message: { id: crypto.randomUUID(), role: 'user', type: 'text', text: chipLabel || 'Submit report' },
        });
        await runSubmitFlow({ ...draftRef.current });
        return;
      }

      if (chipId === 'add_note') {
        dispatch({
          type: 'APPEND_MESSAGE',
          message: { id: crypto.randomUUID(), role: 'user', type: 'text', text: 'Add a note' },
        });
        await say('Type your note below (up to 500 characters), then send it.');
        dispatch({ type: 'SET_STATUS', status: 'AWAIT_NOTE' });
        dispatch({
          type: 'SET_INTERACTION',
          interaction: {
            id: crypto.randomUUID(),
            kind: 'chips',
            options: [{ id: 'skip_note', label: 'Submit without note' }],
          },
        });
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
        await say('Note added! Tap Submit report when you are ready, or type again to replace the note.');
        dispatch({
          type: 'SET_INTERACTION',
          interaction: {
            id: crypto.randomUUID(),
            kind: 'chips',
            options: [{ id: 'skip_note', label: 'Submit report' }],
          },
        });
        return;
      }

      // Text typed at a moment where it can't be used: guide instead of staying silent
      if (state.status === 'IDLE' || state.status === 'DONE') {
        await say('Please send a photo of the issue using the camera or gallery button, and I will take it from there.');
      } else if (state.interaction?.kind === 'chips') {
        await say('Please pick one of the options above to continue.');
      }
    },
    [state.status, state.interaction, say, runSubmitFlow],
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
    clearSavedChat();
    jobRef.current?.abort?.();
    jobRef.current = null;
    queueRef.current = Promise.resolve();
    interactionLockRef.current.clear();
    setTyping(false);
    setInput('');
    dispatch({ type: 'RESET' });
  }, []);

  // Resume an unfinished report after a reload, a reopened browser or coming back from another page
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;

      const { status, draft, messages, interaction, error } = state;
      if (status === 'IDLE' || status === 'DONE') return;
      const photoMsg = [...messages].reverse().find((m) => m.type === 'image');
      if (!photoMsg) return;

      const aiPending =
        ['PROCESSING', 'LOCATING', 'CONFIRM_LOCATION', 'ADJUST_LOCATION', 'WAIT_AI'].includes(status) && !draft.ai;

      let job = null;
      if (!draft.imageUrl || aiPending) {
        const file = await loadPhoto(user?.id);
        if (cancelled) return;
        if (file) {
          try {
            job = createPhotoJob(file, {
              userId: user?.id || '',
              getAccessToken: async () => {
                const { data } = await supabase.auth.getSession();
                if (data?.session?.access_token) return data.session.access_token;
                const { data: refreshed } = await supabase.auth.refreshSession();
                return refreshed?.session?.access_token || '';
              },
            });
          } catch {
            job = null;
          }
        }
      }
      if (!job && draft.imageUrl) job = createResumedJob(draft.imageUrl, draft.ai);

      if (!job) {
        // The photo is gone (storage cleared): start over politely
        dispatch({ type: 'RESET' });
        await say('Your earlier photo is no longer available, so let us start fresh. Please send it again.');
        return;
      }

      jobRef.current = job;
      dispatch({ type: 'SET_JOB_ID', value: job.id });
      dispatch({ type: 'CLEAR_ERROR' });
      dispatch({
        type: 'UPDATE_MESSAGE',
        id: photoMsg.id,
        patch: draft.imageUrl && job.objectUrl === draft.imageUrl
          ? { imageUrl: draft.imageUrl, uploadStatus: 'uploaded' }
          : { imageUrl: job.objectUrl, uploadStatus: 'uploading' },
      });
      wireJob(job, photoMsg.id);

      switch (status) {
        case 'PROCESSING':
        case 'LOCATING':
          await resolveLocation(job);
          break;
        case 'CONFIRM_LOCATION':
        case 'ADJUST_LOCATION':
          if (!interaction && Number.isFinite(draft.lat)) await presentAiAnalysis(job);
          else if (!interaction) await resolveLocation(job);
          break;
        case 'WAIT_AI':
          await presentAiAnalysis(job);
          break;
        case 'CONFIRM_CATEGORY':
          if (!interaction) await presentAiAnalysis(job);
          break;
        case 'PICK_CATEGORY':
          if (!interaction) {
            dispatch({
              type: 'SET_INTERACTION',
              interaction: {
                id: crypto.randomUUID(),
                kind: 'chips',
                options: CATEGORY_OPTIONS.map((c) => ({ id: c.id, label: `${c.icon} ${c.label}` })),
              },
            });
          }
          break;
        case 'AWAIT_NOTE':
          if (!interaction) {
            dispatch({
              type: 'SET_INTERACTION',
              interaction: {
                id: crypto.randomUUID(),
                kind: 'chips',
                options: [
                  { id: 'skip_note', label: 'Submit report' },
                  { id: 'add_note', label: 'Add a note' },
                ],
              },
            });
          }
          break;
        case 'CHECKING_DUPLICATES':
        case 'SUBMITTING':
          dispatch({
            type: 'SET_ERROR',
            text: 'We were interrupted while submitting. Tap Retry to finish. It will not create a duplicate report.',
            retryAction: 'submit',
          });
          dispatch({ type: 'SET_STATUS', status: 'ERROR' });
          break;
        case 'ERROR':
          dispatch({
            type: 'SET_ERROR',
            text: error?.text || 'Something was interrupted. Tap Retry to continue.',
            retryAction: error?.retryAction || 'submit',
          });
          break;
        default:
          break;
      }
    };

    run();

    return () => {
      cancelled = true;
      locationRequestRef.current += 1;
      jobRef.current?.abort?.();
      jobRef.current = null;
      queueRef.current = Promise.resolve();
      interactionLockRef.current.clear();
    };
    // Runs once per mount, using the state restored from storage
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    retryLocation: () => {
      if (jobRef.current) resolveLocation(jobRef.current);
    },
    skipToManualLocation: () => openManualLocation(jobRef.current, 'Pin the exact spot on the map.'),
  };
}
