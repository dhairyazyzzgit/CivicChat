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
  ai: null,
  category: null,
  userCorrected: false,
  note: '',
  mergeGroupId: null,
  clientRequestId: null,
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
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
        status: state.status === 'ERROR' ? 'GREETING' : state.status,
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

  useEffect(() => {
    if (state.status === 'UPLOADING' && state.draft.imageFile) {
      dispatch({ type: 'SET_STATE', status: 'UPLOADING', typing: true, lastAction: 'UPLOAD' });

      uploadPhoto(state.draft.imageFile)
        .then((result) => {
          dispatch({
            type: 'UPDATE_DRAFT',
            patch: {
              imageUrl: result.url,
            },
          });
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

    getLocation(state.draft.imageFile)
      .then((location) => {
        dispatch({
          type: 'UPDATE_DRAFT',
          patch: {
            lat: location.lat,
            lng: location.lng,
            address: location.address,
          },
        });
        addBotMessage({
          id: `map-${Date.now()}`,
          role: 'bot',
          type: 'map',
          address: location.address,
        });
        dispatch({ type: 'SET_STATE', status: 'ANALYZING', typing: true, lastAction: 'ANALYZE' });
      })
      .catch((error) => {
        dispatch({
          type: 'SET_ERROR',
          error: error?.message || 'Location lookup failed. Please try again.',
        });
      });
  }, [state.status, state.draft.imageUrl, state.draft.imageFile]);

  useEffect(() => {
    if (state.status !== 'ANALYZING' || !state.draft.imageUrl) {
      return;
    }

    analyzePhoto(state.draft.imageUrl)
      .then((result) => {
        dispatch({
          type: 'UPDATE_DRAFT',
          patch: {
            ai: result.ai,
            category: result.ai.category,
          },
        });

        const categoryLabel = formatCategoryLabel(result.ai.category);
        const suggestionText = `This looks like a **${categoryLabel}** (${result.ai.severity} severity). ${result.ai.description} Is that right?`;

        addBotMessage({
          id: `suggestion-card-${Date.now()}`,
          role: 'bot',
          type: 'suggestion',
          category: categoryLabel,
          severity: result.ai.severity,
          description: result.ai.description,
          confidence: result.ai.confidence,
        });
        addBotMessage({
          id: `suggestion-text-${Date.now()}`,
          role: 'bot',
          type: 'text',
          text: suggestionText,
        });
        dispatch({
          type: 'SET_CHIPS',
          chips: ["Yes, that's right", "No, it's something else", 'Let me describe it'],
        });
        dispatch({ type: 'SET_STATE', status: 'CONFIRM_CATEGORY', typing: false });
      })
      .catch((error) => {
        dispatch({
          type: 'SET_ERROR',
          error: error?.message || 'We could not analyze the photo. Please try again.',
        });
      });
  }, [state.status, state.draft.imageUrl]);

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
      patch: {
        imageFile: file,
        imageUrl: '',
        clientRequestId: crypto.randomUUID(),
      },
    });
    dispatch({ type: 'CLEAR_ERROR' });
    dispatch({ type: 'SET_STATE', status: 'UPLOADING', typing: true, lastAction: 'UPLOAD' });
    dispatch({ type: 'SET_CHIPS', chips: [] });
  };

  const handleChipSelect = (selection) => {
    const selectionText = selection.trim();
    addUserMessage(selectionText);

    if (state.status === 'CONFIRM_CATEGORY') {
      if (selectionText.toLowerCase().includes('yes')) {
        dispatch({ type: 'SET_CHIPS', chips: [] });
        dispatch({ type: 'SET_STATE', status: 'CHECKING_DUPLICATES', typing: true, lastAction: 'DUPLICATES' });
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
      dispatch({
        type: 'UPDATE_DRAFT',
        patch: {
          category: selected?.value || 'other',
          userCorrected: true,
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
      dispatch({
        type: 'UPDATE_DRAFT',
        patch: {
          ai: {
            ...state.draft.ai,
            description: trimmed,
            category: state.draft.category || state.draft.ai?.category,
          },
        },
      });
      addUserMessage(trimmed);
      addBotMessage({
        id: `note-step-${Date.now()}`,
        role: 'bot',
        type: 'text',
        text: 'Anything else the team should know?',
      });
      dispatch({ type: 'SET_CHIPS', chips: ['No, submit', 'Add a note'] });
      dispatch({ type: 'SET_STATE', status: 'AWAITING_NOTE', typing: false });
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
