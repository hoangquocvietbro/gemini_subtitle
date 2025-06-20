import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { translateSubtitles, /* abortAllRequests, */ cancelTranslation, setProcessingForceStopped } from '../services/geminiService';

// Constants for localStorage keys
const TRANSLATION_CACHE_KEY = 'translated_subtitles_cache';
const CURRENT_VIDEO_ID_KEY = 'current_youtube_url';
const CURRENT_FILE_ID_KEY = 'current_file_cache_id';

/**
 * Helper function to generate a hash for subtitles to use as a cache key
 * @param {Array} subtitles - Array of subtitle objects
 * @returns {string} - Hash string
 */
const generateSubtitleHash = (subtitles) => {
  if (!subtitles || !subtitles.length) return '';

  // Create a string representation of the subtitles (just IDs and text)
  const subtitleString = subtitles.map(s => `${s.id || s.subtitle_id || ''}:${s.text}`).join('|');

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < subtitleString.length; i++) {
    const char = subtitleString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return hash.toString(16);
};

/**
 * Helper function to get the current video/file identifier
 * @returns {string|null} - Current video/file ID or null if not found
 */
const getCurrentMediaId = () => {
  // Check for YouTube URL first
  const youtubeUrl = localStorage.getItem(CURRENT_VIDEO_ID_KEY);
  if (youtubeUrl) {
    // Extract video ID from URL
    const match = youtubeUrl.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/);
    return match ? match[1] : null;
  }

  // Check for file cache ID
  return localStorage.getItem(CURRENT_FILE_ID_KEY);
};

/**
 * Custom hook to manage translation state
 * @param {Array} subtitles - Subtitles to translate
 * @param {Function} onTranslationComplete - Callback when translation is complete
 * @returns {Object} - Translation state and handlers
 */
export const useTranslationState = (subtitles, onTranslationComplete) => {
  const { t } = useTranslation();
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedSubtitles, setTranslatedSubtitles] = useState(null);
  const [error, setError] = useState('');
  const [translationStatus, setTranslationStatus] = useState('');
  const [loadedFromCache, setLoadedFromCache] = useState(false);
  // Use a translation-specific model selection that's independent from settings
  const [selectedModel, setSelectedModel] = useState(() => {
    // Get the model from translation-specific localStorage key or use the global setting as default
    return localStorage.getItem('translation_model') || localStorage.getItem('gemini_model') || 'gemini-2.0-flash';
  });
  const [customTranslationPrompt, setCustomTranslationPrompt] = useState(
    localStorage.getItem('custom_prompt_translation') || null
  );
  const [splitDuration, setSplitDuration] = useState(() => {
    // Get the split duration from localStorage or use default (0 = no split)
    return parseInt(localStorage.getItem('translation_split_duration') || '0');
  });
  const [restTime, setRestTime] = useState(() => {
    // Get the rest time from localStorage or use default (0 = no rest)
    return parseInt(localStorage.getItem('translation_rest_time') || '0');
  });
  const [includeRules, setIncludeRules] = useState(() => {
    // Get the preference from localStorage, but default to false
    // It will be updated to true only if rules are available
    return localStorage.getItem('translation_include_rules') === 'true';
  });
  const [rulesAvailable, setRulesAvailable] = useState(false);
  const [userProvidedSubtitles, setUserProvidedSubtitles] = useState('');
  const hasUserProvidedSubtitles = userProvidedSubtitles.trim() !== '';

  // Reference to the status message element for scrolling
  const statusRef = useRef(null);

  // No longer update selectedModel when localStorage changes
  // This keeps the translation model independent from the settings

  // Listen for translation status updates
  useEffect(() => {
    const handleTranslationStatus = (event) => {
      setTranslationStatus(event.detail.message);
      // Removed auto-scrolling behavior to prevent viewport jumping
    };

    window.addEventListener('translation-status', handleTranslationStatus);
    return () => window.removeEventListener('translation-status', handleTranslationStatus);
  }, []);

  // Load translations from cache on component mount
  useEffect(() => {
    // Only try to load from cache if we don't have results yet and have subtitles to translate
    if (translatedSubtitles || !subtitles || subtitles.length === 0) return;

    try {
      // Get current media ID
      const mediaId = getCurrentMediaId();
      if (!mediaId) return;

      // Generate a hash of the subtitles
      const subtitleHash = generateSubtitleHash(subtitles);

      // Get cache entry
      const cacheEntryJson = localStorage.getItem(TRANSLATION_CACHE_KEY);
      if (!cacheEntryJson) return;

      const cacheEntry = JSON.parse(cacheEntryJson);

      // Check if cache entry is for the current media and subtitles
      if (cacheEntry.mediaId !== mediaId || cacheEntry.subtitleHash !== subtitleHash) return;

      // Check if we have translations
      if (!cacheEntry.translations || !cacheEntry.translations.length) return;

      // Set loading state first
      setLoadedFromCache(true);

      // Use a small timeout to ensure the loading state is rendered
      setTimeout(() => {
        // Set the translated subtitles
        setTranslatedSubtitles(cacheEntry.translations);

        // Call the callback
        if (onTranslationComplete) {
          onTranslationComplete(cacheEntry.translations);
        }

        // Dispatch a custom event to notify other components that translation is complete
        window.dispatchEvent(new CustomEvent('translation-complete', {
          detail: {
            translatedSubtitles: cacheEntry.translations,
            loadedFromCache: true
          }
        }));

        // Show a status message
        setTranslationStatus(t('translation.loadedFromCache', 'Translations loaded from cache'));
      }, 100);
    } catch (error) {
      console.error('Error loading translations from cache:', error);
    }
  }, [subtitles, translatedSubtitles, onTranslationComplete, t]);

  // Check if transcription rules are available
  useEffect(() => {
    const checkRulesAvailability = async () => {
      try {
        // Dynamically import to avoid circular dependencies
        const { getTranscriptionRulesSync } = await import('../utils/transcriptionRulesStore');
        const rules = getTranscriptionRulesSync();
        const hasRules = !!rules;
        setRulesAvailable(hasRules);

        // If rules are not available, set includeRules to false
        if (!hasRules) {
          setIncludeRules(false);
          localStorage.setItem('translation_include_rules', 'false');
        }


      } catch (error) {
        console.error('Error checking transcription rules availability:', error);
        setRulesAvailable(false);
        setIncludeRules(false);
        localStorage.setItem('translation_include_rules', 'false');
      }
    };

    checkRulesAvailability();
  }, []);

  // Load user-provided subtitles
  useEffect(() => {
    const loadUserProvidedSubtitles = async () => {
      try {
        // Dynamically import to avoid circular dependencies
        const { getUserProvidedSubtitlesSync } = await import('../utils/userSubtitlesStore');
        const subtitles = getUserProvidedSubtitlesSync();
        setUserProvidedSubtitles(subtitles || '');

        // If user-provided subtitles are present, set includeRules to false
        if (subtitles && subtitles.trim() !== '') {
          setIncludeRules(false);
          localStorage.setItem('translation_include_rules', 'false');
        }


      } catch (error) {
        console.error('Error loading user-provided subtitles:', error);
        setUserProvidedSubtitles('');
      }
    };

    loadUserProvidedSubtitles();
  }, []);

  /**
   * Handle model selection for translation only
   * @param {string} modelId - Selected model ID
   */
  const handleModelSelect = (modelId) => {
    // Update the local state
    setSelectedModel(modelId);
    // Save to translation-specific localStorage key to remember the choice
    // This keeps the translation model independent from the settings
    localStorage.setItem('translation_model', modelId);
  };

  /**
   * Handle saving custom prompt
   * @param {string} newPrompt - New custom prompt
   */
  const handleSavePrompt = (newPrompt) => {
    setCustomTranslationPrompt(newPrompt);
    localStorage.setItem('custom_prompt_translation', newPrompt);
  };

  /**
   * Handle translation
   * @param {Array} languages - Languages to translate to
   * @param {string|null} delimiter - Delimiter for multi-language translation
   * @param {boolean} useParentheses - Whether to use parentheses for the second language
   * @param {Object} bracketStyle - Optional bracket style { open, close }
   * @param {Array} chainItems - Optional chain items for format mode
   */
  const handleTranslate = async (languages, delimiter = ' ', useParentheses = false, bracketStyle = null, chainItems = null) => {
    // Check if at least one language is entered (unless in format mode with chainItems)
    if (languages.length === 0 && !chainItems) {
      setError(t('translation.languageRequired', 'Please enter at least one target language'));
      return;
    }

    if (!subtitles || subtitles.length === 0) {
      setError(t('translation.noSubtitles', 'No subtitles to translate'));
      return;
    }

    // Reset the processing force stopped flag before starting a new translation
    // This is important to ensure that previous cancellations don't affect new translations
    setProcessingForceStopped(false);


    setError('');
    setIsTranslating(true);

    try {
      // For 2 target languages, we can use both delimiter and brackets
      // For 3+ languages, we only use delimiter
      const useBothOptions = languages.length === 2 && useParentheses;

      // Pass the selected model, custom prompt, split duration, includeRules, delimiter and parentheses options
      const result = await translateSubtitles(
        subtitles,
        languages.length === 1 ? languages[0] : languages,
        selectedModel,
        customTranslationPrompt,
        splitDuration,
        includeRules,
        useBothOptions ? delimiter : (useParentheses ? null : delimiter), // Pass delimiter even when using parentheses for 2 languages
        useParentheses,
        bracketStyle, // Pass the bracket style
        chainItems // Pass the chain items for format mode
      );


      // Check if result is valid
      if (!result || result.length === 0) {
        console.error('Translation returned empty result');
        setError(t('translation.emptyResult', 'Translation returned no results. Please try again or check the console for errors.'));
        return;
      }

      // Save translations to cache
      try {
        // Get current media ID
        const mediaId = getCurrentMediaId();
        if (mediaId) {
          // Generate a hash of the subtitles
          const subtitleHash = generateSubtitleHash(subtitles);

          // Create cache entry
          const cacheEntry = {
            mediaId,
            subtitleHash,
            timestamp: Date.now(),
            translations: result
          };

          // Save to localStorage
          localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(cacheEntry));
        }
      } catch (error) {
        console.error('Error saving translations to cache:', error);
      }

      setTranslatedSubtitles(result);
      if (onTranslationComplete) {
        onTranslationComplete(result);
      }

      // Dispatch a custom event to notify other components that translation is complete
      window.dispatchEvent(new CustomEvent('translation-complete', {
        detail: {
          translatedSubtitles: result,
          loadedFromCache: false
        }
      }));


      // Save the split duration setting to localStorage
      localStorage.setItem('translation_split_duration', splitDuration.toString());
    } catch (err) {
      console.error('Translation error:', err);
      setError(t('translation.error', 'Error translating subtitles. Please try again.'));
    } finally {
      setIsTranslating(false);
    }
  };

  /**
   * Handle cancellation of translation
   */
  const handleCancelTranslation = () => {

    // Call the cancelTranslation function from the translation service
    // This will abort all active requests and set the processingForceStopped flag to true
    // Note: The processingForceStopped flag will be reset to false when starting a new translation
    // or when resetting the translation
    /* const aborted = */ cancelTranslation();


    // Update UI state
    setIsTranslating(false);
    setError(t('translation.cancelled', 'Translation cancelled by user'));

    // Update translation status to show cancellation
    setTranslationStatus(t('translation.cancelled', 'Translation cancelled by user'));
  };

  /**
   * Handle reset of translation
   */
  const handleReset = () => {
    setTranslatedSubtitles(null);
    setError('');
    setLoadedFromCache(false);

    // Reset the processing force stopped flag when resetting translation
    setProcessingForceStopped(false);


    if (onTranslationComplete) {
      onTranslationComplete(null);
    }

    // Dispatch a custom event to notify other components that translation has been reset
    window.dispatchEvent(new CustomEvent('translation-reset', {
      detail: {
        translatedSubtitles: null
      }
    }));

  };

  /**
   * Handle split duration change
   * @param {number} value - New split duration value
   */
  const handleSplitDurationChange = (value) => {
    setSplitDuration(value);
    localStorage.setItem('translation_split_duration', value.toString());
  };

  /**
   * Handle rest time change
   * @param {number} value - New rest time value in seconds
   */
  const handleRestTimeChange = (value) => {
    setRestTime(value);
    localStorage.setItem('translation_rest_time', value.toString());
  };

  /**
   * Handle include rules toggle
   * @param {boolean} value - New include rules value
   */
  const handleIncludeRulesChange = (value) => {
    setIncludeRules(value);
    localStorage.setItem('translation_include_rules', value.toString());
  };

  return {
    isTranslating,
    translatedSubtitles,
    error,
    translationStatus,
    selectedModel,
    customTranslationPrompt,
    splitDuration,
    restTime,
    includeRules,
    rulesAvailable,
    hasUserProvidedSubtitles,
    loadedFromCache,
    statusRef,
    handleModelSelect,
    handleSavePrompt,
    handleTranslate,
    handleCancelTranslation,
    handleReset,
    handleSplitDurationChange,
    handleRestTimeChange,
    handleIncludeRulesChange
  };
};

export default useTranslationState;
