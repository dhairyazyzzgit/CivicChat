import { useEffect, useReducer, useState } from 'react';
import {
  analyzePhoto,
  findDuplicates,
  getLocation,
  submitReport,
  uploadPhoto,
} from '../lib/chatServices';

const BOT_GREETING =
  "Hi, I'm CivicBot. See something broken in your area, like a pothole, garbage, an open drain or loose wires? Send me a photo and I'll handle the rest.";

const STATUS_LABELS = {
  pothole: 'Pothole',
  garbage: 'Garbage',
  open_drain: 'Open drain',
  waterlogging: 'Waterlogging',
  electrical_hazard: 'Electrical hazard',
  streetlight: 'Streetlight',
  fallen_tree: 'Fallen tree',
  other: 'Other',
};

const CATEGORY_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));

const INITIAL_DRAFT = {
  imageFile: null,
  imageUrl: '',
  lat: null,
  lng: null,
  address: '',
  exifGps: null,
  ai: null,
  category: null,
  analysisText: '',
  userCorrected: false,
  note: '',
  mergeGroupId: null,
  clientRequestId: null,
  isLocationConfirmed: false,
};

const initialState = {
  status: 'GREETING',
  draft: {
    ...INITIAL_DRAFT,
    clientRequestId: crypto.randomUUID(),
  },
  messages: [{ id: 'welcome-message', role: 'bot', type: 'text', text: BOT_GREETING }],
  chips: [],
  error: null,
  lastAction: null,
  report: null,
  typing: false,
  uploadProgress: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.message],
        typing: false,
      };
    case 'SET_STATE':
      return {
        ...state,
        status: action.status,
        typing: action.typing ?? state.typing,
        lastAction: action.lastAction || state.lastAction,
        uploadProgress: action.status === 'UPLOADING' ? state.uploadProgress : null,
      };
    case 'SET_UPLOAD_PROGRESS':
      return {
        ...state,
        uploadProgress: action.payload,
      };
    case 'UPDATE_DRAFT':
      return {
        ...state,
        draft: {
          ...state.draft,
          ...action.patch,
        },
      };
    case 'SET_CHIPS':
      return {
        ...state,
        chips: action.chips || [],
      };
    case 'SET_ERROR':
      return {
        ...state,
        status: 'ERROR',
        error: action.error,
        typing: false,
        chips: [],
        uploadProgress: null,
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
        status: state.status === 'ERROR' ? 'GREETING' : state.status,
        uploadProgress: null,
      };
    case 'SET_REPORT':
      return {
        ...state,
        report: action.report,
      };
    case 'RESET':
      return {
        ...initialState,
        draft: {
          ...INITIAL_DRAFT,
          clientRequestId: crypto.randomUUID(),
        },
        messages: [{ id: 'welcome-message', role: 'bot', type: 'text', text: BOT_GREETING }],
        uploadProgress: null,
      };
    default:
      return state;
  }
}

function isBotBusy(status) {
  return ['UPLOADING', 'LOCATING', 'ANALYZING', 'CHECKING_DUPLICATES', 'SUBMITTING'].includes(status);
}

function formatCategoryLabel(value) {
  return STATUS_LABELS[value] || 'Other';
}

function normalizeAiResult(result) {
  const next = result || {};
  return {
    is_civic_issue: Boolean(next.is_civic_issue),
    category: next.category || 'other',
    severity: next.severity || 'medium',
    description: String(next.description || '').trim().slice(0, 200),
    confidence: Number(next.confidence ?? 0.5),
    alternatives: Array.isArray(next.alternatives) ? next.alternatives.slice(0, 2) : [],
  };
}

function selectCategoryChips(aiResult) {
  const normalized = normalizeAiResult(aiResult);
  const choices = [normalized.category, ...(normalized.alternatives || []).slice(0, 2)].slice(0, 3);
  return choices.map((value) => formatCategoryLabel(value));
}

function resetDraftForNextPhoto(file = null) {
  return {
    ...INITIAL_DRAFT,
    imageFile: file,
    imageUrl: '',
    analysisText: '',
    clientRequestId: crypto.randomUUID(),
  };
}

export function useChatFlow() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [input, setInput] = useState('');

  const addBotMessage = (message) => {
    dispatch({ type: 'ADD_MESSAGE', message });
  };

  const addUserMessage = (text) => {
    dispatch({
      type: 'ADD_MESSAGE',
      message: {
        id: `user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role: 'user',
        type: 'text',
        text,
      },
    });
  };

  const runAnalyze = (userText) => {
    if (!state.draft.imageUrl) {
      return;
    }

    dispatch({
      type: 'UPDATE_DRAFT',
      patch: {
        analysisText: userText || '',
      },
    });

    dispatch({ type: 'SET_STATE', status: 'ANALYZING', typing: true, lastAction: 'ANALYZE' });
  };

  useEffect(() => {
    if (state.status === 'UPLOADING' && state.draft.imageFile) {
      dispatch({ type: 'SET_STATE', status: 'UPLOADING', typing: true, lastAction: 'UPLOAD' });
      dispatch({ type: 'SET_UPLOAD_PROGRESS', payload: { label: 'Preparing photo…', value: 10 } });

      uploadPhoto(state.draft.imageFile, (label, value) => {
        dispatch({ type: 'SET_UPLOAD_PROGRESS', payload: { label, value } });
      })
        .then((result) => {
          dispatch({
            type: 'UPDATE_DRAFT',
            patch: {
              imageUrl: result.url,
              exifGps: result.gps,
            },
          });
          dispatch({ type: 'SET_UPLOAD_PROGRESS', payload: { label: 'Photo uploaded', value: 100 } });
          setTimeout(() => {
            dispatch({ type: 'SET_UPLOAD_PROGRESS', payload: null });
          }, 700);
          dispatch({ type: 'SET_STATE', status: 'LOCATING', typing: true, lastAction: 'LOCATING' });
          addBotMessage({
            id: `bot-${Date.now()}`,
            role: 'bot',
            type: 'text',
            text: 'Got it. Looking at your photo...',
          });
          addBotMessage({
            id: `image-${Date.now()}`,
            role: 'bot',
            type: 'image',
            imageUrl: result.url,
            alt: 'Uploaded issue photo',
            progress: 100,
          });
        })
        .catch((error) => {
          dispatch({
            type: 'SET_ERROR',
            error: error?.message || 'Photo upload failed. Please try again.',
          });
        });
    }
  }, [state.status, state.draft.imageFile]);

  useEffect(() => {
    if (state.status !== 'LOCATING' || !state.draft.imageUrl) {
      return;
    }

    getLocation(state.draft.imageFile, state.draft.exifGps)
      .then((location) => {
        const nextDraft = {
          lat: location.lat,
          lng: location.lng,
          address: location.address,
        };

        if (location.mode === 'manual') {
          addBotMessage({
            id: `location-prompt-${Date.now()}`,
            role: 'bot',
            type: 'text',
            text: 'I need your location so the right team can find this spot. Please allow location access.',
          });
          addBotMessage({
            id: `map-${Date.now()}`,
            role: 'bot',
            type: 'map',
            latitude: location.lat,
            longitude: location.lng,
            address: location.address,
            manualMode: true,
            onConfirm: ({ lat, lng, address: selectedAddress }) => {
              dispatch({
                type: 'UPDATE_DRAFT',
                patch: {
                  lat,
                  lng,
                  address: selectedAddress,
                  isLocationConfirmed: true,
                },
              });
              dispatch({ type: 'SET_CHIPS', chips: [] });
              dispatch({ type: 'SET_STATE', status: 'CONFIRM_LOCATION', typing: false, lastAction: 'CONFIRM_LOCATION' });
            },
          });
          dispatch({
            type: 'UPDATE_DRAFT',
            patch: {
              ...nextDraft,
              isLocationConfirmed: false,
            },
          });
          dispatch({ type: 'SET_STATE', status: 'CONFIRM_LOCATION', typing: false, lastAction: 'CONFIRM_LOCATION' });
          return;
        }

        dispatch({
          type: 'UPDATE_DRAFT',
          patch: {
            ...nextDraft,
            isLocationConfirmed: false,
          },
        });
        addBotMessage({
          id: `map-${Date.now()}`,
          role: 'bot',
          type: 'map',
          latitude: location.lat,
          longitude: location.lng,
          address: location.address,
          onConfirm: ({ lat, lng, address: selectedAddress }) => {
            dispatch({
              type: 'UPDATE_DRAFT',
              patch: {
                lat,
                lng,
                address: selectedAddress,
                isLocationConfirmed: true,
              },
            });
            dispatch({ type: 'SET_CHIPS', chips: [] });
            dispatch({ type: 'SET_STATE', status: 'CONFIRM_LOCATION', typing: false, lastAction: 'CONFIRM_LOCATION' });
          },
        });
        dispatch({ type: 'SET_STATE', status: 'CONFIRM_LOCATION', typing: false, lastAction: 'CONFIRM_LOCATION' });
      })
      .catch((error) => {
        dispatch({
          type: 'SET_ERROR',
          error: error?.message || 'Location lookup failed. Please try again.',
        });
      });
  }, [state.status, state.draft.imageUrl, state.draft.imageFile, state.draft.exifGps]);

  useEffect(() => {
    if (state.status !== 'CONFIRM_LOCATION' || !state.draft.imageUrl || !state.draft.isLocationConfirmed) {
      return;
    }

    dispatch({ type: 'SET_STATE', status: 'ANALYZING', typing: true, lastAction: 'ANALYZE' });
  }, [state.status, state.draft.imageUrl, state.draft.isLocationConfirmed]);

  useEffect(() => {
    if (state.status !== 'ANALYZING' || !state.draft.imageUrl) {
      return;
    }

    analyzePhoto(state.draft.imageUrl, state.draft.analysisText || undefined)
      .then((result) => {
        const normalized = normalizeAiResult(result);
        dispatch({
          type: 'UPDATE_DRAFT',
          patch: {
            ai: normalized,
            category: normalized.category,
            userCorrected: false,
          },
        });

        if (!normalized.is_civic_issue) {
          addBotMessage({
            id: `not-civic-${Date.now()}`,
            role: 'bot',
            type: 'text',
            text: "This doesn't look like a public civic issue. Want to try another photo?",
          });
          dispatch({ type: 'SET_STATE', status: 'AWAITING_PHOTO', typing: false, lastAction: 'UPLOAD' });
          dispatch({ type: 'SET_CHIPS', chips: ['Upload another photo'] });
          return;
        }

        const categoryLabel = formatCategoryLabel(normalized.category);
        const shortQuestion = `This looks like ${categoryLabel.toLowerCase()}. Is this right?`;

        addBotMessage({
          id: `suggestion-card-${Date.now()}`,
          role: 'bot',
          type: 'suggestion',
          category: categoryLabel,
          severity: normalized.severity,
          description: normalized.description,
          confidence: normalized.confidence,
        });

        if (normalized.confidence < 0.6) {
          addBotMessage({
            id: `low-confidence-${Date.now()}`,
            role: 'bot',
            type: 'text',
            text: "I'm not fully sure. Is it one of these?",
          });
          const chips = [
            formatCategoryLabel(normalized.category),
            ...(normalized.alternatives || []).map((alternative) => formatCategoryLabel(alternative)),
            'Something else',
          ];
          dispatch({ type: 'SET_CHIPS', chips });
          dispatch({ type: 'SET_STATE', status: 'LOW_CONFIDENCE', typing: false, lastAction: 'ANALYZE' });
          return;
        }

        addBotMessage({
          id: `suggestion-text-${Date.now()}`,
          role: 'bot',
          type: 'text',
          text: shortQuestion,
        });
        dispatch({
          type: 'SET_CHIPS',
          chips: ["Yes, that's right", "No, it's something else", 'Let me describe it'],
        });
        dispatch({ type: 'SET_STATE', status: 'CONFIRM_CATEGORY', typing: false, lastAction: 'ANALYZE' });
      })
      .catch((error) => {
        addBotMessage({
          id: `fallback-ai-${Date.now()}`,
          role: 'bot',
          type: 'text',
          text: "I couldn't analyse the photo right now, so please pick the category yourself.",
        });
        dispatch({
          type: 'SET_CHIPS',
          chips: CATEGORY_OPTIONS.map((option) => option.label),
        });
        dispatch({ type: 'SET_STATE', status: 'PICK_CATEGORY', typing: false, lastAction: 'ANALYZE' });
      });
  }, [state.status, state.draft.imageUrl, state.draft.analysisText]);

  useEffect(() => {
    if (state.status !== 'CHECKING_DUPLICATES') {
      return;
    }

    findDuplicates(state.draft)
      .then((result) => {
        if (result.duplicates) {
          dispatch({
            type: 'UPDATE_DRAFT',
            patch: {
              mergeGroupId: result.groupId,
            },
          });
        }

        dispatch({ type: 'SET_STATE', status: 'SUBMITTING', typing: true, lastAction: 'SUBMIT' });
      })
      .catch((error) => {
        dispatch({
          type: 'SET_ERROR',
          error: error?.message || 'We could not check for nearby reports. Please try again.',
        });
      });
  }, [state.status, state.draft]);

  useEffect(() => {
    if (state.status !== 'SUBMITTING') {
      return;
    }

    submitReport(state.draft)
      .then((result) => {
        dispatch({ type: 'SET_REPORT', report: result });

        addBotMessage({
          id: `done-text-${Date.now()}`,
          role: 'bot',
          type: 'text',
          text: `Done! I've sent this to ${result.department}. I'll update you when the status changes.`,
        });
        addBotMessage({
          id: `confirmation-${Date.now()}`,
          role: 'bot',
          type: 'confirmation',
          reportCode: result.reportCode,
          category: result.category,
          severity: result.severity,
          address: result.address,
          department: result.department,
          status: result.status,
          reportId: result.id,
        });
        addBotMessage({
          id: `follow-up-${Date.now()}`,
          role: 'bot',
          type: 'text',
          text: 'Want to report another issue? Send a new photo anytime.',
        });

        dispatch({ type: 'SET_STATE', status: 'DONE', typing: false });
        dispatch({ type: 'SET_CHIPS', chips: [] });
      })
      .catch((error) => {
        dispatch({
          type: 'SET_ERROR',
          error: error?.message || 'We could not submit your report. Please try again.',
        });
      });
  }, [state.status, state.draft]);

  const handlePhotoSelect = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      dispatch({ type: 'SET_ERROR', error: 'Please choose a valid image file.' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      dispatch({ type: 'SET_ERROR', error: 'Images must be 5 MB or smaller.' });
      return;
    }

    dispatch({
      type: 'UPDATE_DRAFT',
      patch: resetDraftForNextPhoto(file),
    });
    dispatch({ type: 'CLEAR_ERROR' });
    dispatch({ type: 'SET_STATE', status: 'UPLOADING', typing: true, lastAction: 'UPLOAD' });
    dispatch({ type: 'SET_CHIPS', chips: [] });
  };

  const handleChipSelect = (selection) => {
    const selectionText = selection.trim();
    addUserMessage(selectionText);
    setInput('');

    if (state.status === 'AWAITING_PHOTO') {
      dispatch({ type: 'SET_CHIPS', chips: [] });
      dispatch({
        type: 'UPDATE_DRAFT',
        patch: resetDraftForNextPhoto(),
      });
      dispatch({ type: 'SET_STATE', status: 'GREETING', typing: false, lastAction: 'UPLOAD' });
      addBotMessage({
        id: `photo-reset-${Date.now()}`,
        role: 'bot',
        type: 'text',
        text: 'Absolutely — please upload a new photo and I’ll re-check it.',
      });
      return;
    }

    if (state.status === 'CONFIRM_LOCATION') {
      if (selectionText.toLowerCase().includes('yes')) {
        if (!state.draft.isLocationConfirmed) {
          return;
        }
        dispatch({ type: 'SET_CHIPS', chips: [] });
        runAnalyze();
        return;
      }

      if (selectionText.toLowerCase().includes('adjust')) {
        dispatch({ type: 'SET_CHIPS', chips: [] });
        return;
      }
    }

    if (state.status === 'LOW_CONFIDENCE') {
      const normalizedChoice = selectionText.toLowerCase();
      if (normalizedChoice.includes('something else')) {
        dispatch({ type: 'SET_CHIPS', chips: [] });
        addBotMessage({
          id: `bot-category-${Date.now()}`,
          role: 'bot',
          type: 'text',
          text: 'No problem. What is it?',
        });
        dispatch({
          type: 'SET_CHIPS',
          chips: CATEGORY_OPTIONS.map((option) => option.label),
        });
        dispatch({ type: 'SET_STATE', status: 'PICK_CATEGORY', typing: false });
        return;
      }

      const selected = CATEGORY_OPTIONS.find((option) => option.label.toLowerCase() === selectionText.toLowerCase());
      const categoryValue = selected?.value || state.draft.ai?.category || 'other';
      const userCorrected = categoryValue !== state.draft.ai?.category;
      dispatch({
        type: 'UPDATE_DRAFT',
        patch: {
          category: categoryValue,
          userCorrected,
        },
      });
      dispatch({ type: 'SET_CHIPS', chips: [] });
      addBotMessage({
        id: `note-step-${Date.now()}`,
        role: 'bot',
        type: 'text',
        text: 'Anything else the team should know?',
      });
      dispatch({ type: 'SET_CHIPS', chips: ['No, submit', 'Add a note'] });
      dispatch({ type: 'SET_STATE', status: 'AWAITING_NOTE', typing: false });
      return;
    }

    if (state.status === 'CONFIRM_CATEGORY') {
      if (selectionText.toLowerCase().includes('yes')) {
        dispatch({ type: 'SET_CHIPS', chips: [] });
        addBotMessage({
          id: `note-step-${Date.now()}`,
          role: 'bot',
          type: 'text',
          text: 'Anything else the team should know?',
        });
        dispatch({ type: 'SET_CHIPS', chips: ['No, submit', 'Add a note'] });
        dispatch({ type: 'SET_STATE', status: 'AWAITING_NOTE', typing: false });
        return;
      }

      if (selectionText.toLowerCase().includes('no')) {
        dispatch({ type: 'SET_CHIPS', chips: [] });
        addBotMessage({
          id: `bot-category-${Date.now()}`,
          role: 'bot',
          type: 'text',
          text: 'No problem. What is it?',
        });
        dispatch({
          type: 'SET_CHIPS',
          chips: CATEGORY_OPTIONS.map((option) => option.label),
        });
        dispatch({ type: 'SET_STATE', status: 'PICK_CATEGORY', typing: false });
        return;
      }

      if (selectionText.toLowerCase().includes('describe')) {
        dispatch({ type: 'SET_CHIPS', chips: [] });
        addBotMessage({
          id: `bot-description-${Date.now()}`,
          role: 'bot',
          type: 'text',
          text: 'Tell me what you see in your own words.',
        });
        dispatch({ type: 'SET_STATE', status: 'AWAITING_DESCRIPTION', typing: false });
        return;
      }
    }

    if (state.status === 'PICK_CATEGORY') {
      const selected = CATEGORY_OPTIONS.find((option) => option.label.toLowerCase() === selectionText.toLowerCase());
      const categoryValue = selected?.value || 'other';
      dispatch({
        type: 'UPDATE_DRAFT',
        patch: {
          category: categoryValue,
          userCorrected: categoryValue !== state.draft.ai?.category,
        },
      });
      dispatch({ type: 'SET_CHIPS', chips: [] });
      addBotMessage({
        id: `note-step-${Date.now()}`,
        role: 'bot',
        type: 'text',
        text: 'Anything else the team should know?',
      });
      dispatch({ type: 'SET_CHIPS', chips: ['No, submit', 'Add a note'] });
      dispatch({ type: 'SET_STATE', status: 'AWAITING_NOTE', typing: false });
      return;
    }

    if (state.status === 'AWAITING_NOTE') {
      if (selectionText === 'No, submit') {
        dispatch({ type: 'SET_CHIPS', chips: [] });
        dispatch({ type: 'SET_STATE', status: 'CHECKING_DUPLICATES', typing: true, lastAction: 'DUPLICATES' });
        return;
      }

      if (selectionText === 'Add a note') {
        dispatch({ type: 'SET_CHIPS', chips: [] });
        addBotMessage({
          id: `bot-note-${Date.now()}`,
          role: 'bot',
          type: 'text',
          text: 'Please add your note below.',
        });
        dispatch({ type: 'SET_STATE', status: 'AWAITING_NOTE_INPUT', typing: false });
      }
    }
  };

  const handleUserText = (text) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    if (state.status === 'AWAITING_DESCRIPTION') {
      addUserMessage(trimmed);
      dispatch({
        type: 'UPDATE_DRAFT',
        patch: {
          analysisText: trimmed,
          note: trimmed,
        },
      });
      dispatch({ type: 'SET_CHIPS', chips: [] });
      runAnalyze(trimmed);
      setInput('');
      return;
    }

    if (state.status === 'AWAITING_NOTE_INPUT') {
      dispatch({
        type: 'UPDATE_DRAFT',
        patch: {
          note: trimmed,
        },
      });
      addUserMessage(trimmed);
      dispatch({ type: 'SET_CHIPS', chips: [] });
      dispatch({ type: 'SET_STATE', status: 'CHECKING_DUPLICATES', typing: true, lastAction: 'DUPLICATES' });
      setInput('');
      return;
    }

    if (state.status === 'GREETING' || isBotBusy(state.status) || state.status === 'ERROR') {
      return;
    }

    addUserMessage(trimmed);
    setInput('');
  };

  const retry = () => {
    const target = state.lastAction;
    if (!target) {
      return;
    }

    dispatch({ type: 'CLEAR_ERROR' });

    if (target === 'UPLOAD') {
      dispatch({ type: 'SET_STATE', status: 'UPLOADING', typing: true, lastAction: 'UPLOAD' });
    }
    if (target === 'LOCATING') {
      dispatch({ type: 'SET_STATE', status: 'LOCATING', typing: true, lastAction: 'LOCATING' });
    }
    if (target === 'ANALYZE') {
      dispatch({ type: 'SET_STATE', status: 'ANALYZING', typing: true, lastAction: 'ANALYZE' });
    }
    if (target === 'DUPLICATES') {
      dispatch({ type: 'SET_STATE', status: 'CHECKING_DUPLICATES', typing: true, lastAction: 'DUPLICATES' });
    }
    if (target === 'SUBMIT') {
      dispatch({ type: 'SET_STATE', status: 'SUBMITTING', typing: true, lastAction: 'SUBMIT' });
    }
  };

  const canSend = Boolean(input.trim()) && !isBotBusy(state.status) && state.status !== 'ERROR';

  return {
    state,
    input,
    setInput,
    messages: state.messages,
    chips: state.chips,
    draft: state.draft,
    error: state.error,
    uploadProgress: state.uploadProgress,
    typing: state.typing || isBotBusy(state.status),
    canSend,
    handlePhotoSelect,
    handleChipSelect,
    handleUserText,
    retry,
    reset: () => dispatch({ type: 'RESET' }),
    isBusy: isBotBusy(state.status),
  };
}
