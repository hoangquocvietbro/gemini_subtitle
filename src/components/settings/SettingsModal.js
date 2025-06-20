import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import '../../styles/SettingsModal.css';
import '../../styles/settings/checkbox-fix.css';
import '../../styles/components/tab-content-animations.css';
import { DEFAULT_TRANSCRIPTION_PROMPT } from '../../services/geminiService';
import { getClientCredentials, hasValidTokens } from '../../services/youtubeApiService';
import { getAllKeys, saveAllKeys, getCurrentKey } from '../../services/gemini/keyManager';
import LanguageSelector from '../LanguageSelector';
import { API_BASE_URL } from '../../config';

// Import modularized components
import ApiKeysTab from './tabs/ApiKeysTab';
import VideoProcessingTab from './tabs/VideoProcessingTab';
import PromptsTab from './tabs/PromptsTab';
import CacheTab from './tabs/CacheTab';
import AboutTab from './tabs/AboutTab';
import ModelManagementTab from './ModelManagementTab';

// Import icons
import { ApiKeyIcon, ProcessingIcon, PromptIcon, CacheIcon, AboutIcon, ModelIcon } from './icons/TabIcons';

// Import theme utilities
import { toggleTheme as toggleThemeUtil, getThemeIcon, getThemeLabel, initializeTheme, setupSystemThemeListener } from './utils/themeUtils';
import initSettingsTabPillAnimation from '../../utils/settingsTabPillAnimation';
import initSettingsTabsDrag from '../../utils/settingsTabsDrag';

const SettingsModal = ({ onClose, onSave, apiKeysSet, setApiKeysSet }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(() => {
    // Load last active tab from localStorage or default to 'api-keys'
    const savedTab = localStorage.getItem('settings_last_active_tab');
    // If the saved tab is 'gemini-settings', redirect to 'api-keys' since we removed that tab
    return (savedTab === 'gemini-settings') ? 'api-keys' : (savedTab || 'api-keys');
  });

  // Reference to the tabs container
  const tabsRef = useRef(null);

  // State for tracking when the modal is closing
  const [isClosing, setIsClosing] = useState(false);

  // State for tracking tab transitions
  const [previousTab, setPreviousTab] = useState(null);
  const [animationDirection, setAnimationDirection] = useState('center');

  // Theme state
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  // State for tracking which About background to show
  const [backgroundType, setBackgroundType] = useState(() => {
    // Initialize from localStorage
    return localStorage.getItem('about_background_type') || 'default';
  });

  // Initialize pill position and drag functionality on component mount
  useEffect(() => {
    if (tabsRef.current) {
      // Small delay to ensure the DOM is fully rendered
      setTimeout(() => {
        initSettingsTabPillAnimation('.settings-tabs');

        // Initialize drag functionality for tabs
        const cleanupDrag = initSettingsTabsDrag('.settings-tabs');

        // Return cleanup function
        return () => {
          if (cleanupDrag) cleanupDrag();
        };
      }, 50);
    }
  }, []);

  // Update pill position when active tab changes
  useEffect(() => {
    if (tabsRef.current) {
      // Reset wasActive and lastActive attributes on all tabs when active tab changes programmatically
      const tabButtons = tabsRef.current.querySelectorAll('.settings-tab');
      tabButtons.forEach(tab => {
        tab.dataset.wasActive = 'false';
        tab.dataset.lastActive = 'false';
      });

      // Determine animation direction based on tab order
      if (previousTab) {
        const tabOrder = ['api-keys', 'video-processing', 'prompts', 'cache', 'model-management', 'about'];
        const prevIndex = tabOrder.indexOf(previousTab);
        const currentIndex = tabOrder.indexOf(activeTab);

        if (prevIndex !== -1 && currentIndex !== -1) {
          if (prevIndex < currentIndex) {
            setAnimationDirection('left');
          } else if (prevIndex > currentIndex) {
            setAnimationDirection('right');
          } else {
            setAnimationDirection('center');
          }
        } else {
          setAnimationDirection('center');
        }
      }

      // Update previous tab for next change
      setPreviousTab(activeTab);

      // Small delay to ensure the active class is applied
      setTimeout(() => {
        initSettingsTabPillAnimation('.settings-tabs');
      }, 10);
    }
  }, [activeTab, previousTab]);

  const [hasChanges, setHasChanges] = useState(false); // Track if any settings have changed
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false); // Track if settings have been loaded
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [geniusApiKey, setGeniusApiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showYoutubeKey, setShowYoutubeKey] = useState(false);
  const [showGeniusKey, setShowGeniusKey] = useState(false);
  const [useOAuth, setUseOAuth] = useState(false);
  const [youtubeClientId, setYoutubeClientId] = useState('');
  const [youtubeClientSecret, setYoutubeClientSecret] = useState('');
  const [showClientId, setShowClientId] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [segmentDuration, setSegmentDuration] = useState(5); // Default to 5 minutes
  const [geminiModel, setGeminiModel] = useState('gemini-2.0-flash'); // Default model
  const [timeFormat, setTimeFormat] = useState('hms'); // Default to HH:MM:SS format
  const [showWaveform, setShowWaveform] = useState(true); // Default to showing waveform
  const [segmentOffsetCorrection, setSegmentOffsetCorrection] = useState(-3.0); // Default offset correction for second segment
  const [useVideoAnalysis, setUseVideoAnalysis] = useState(true); // Default to using video analysis
  const [videoAnalysisModel, setVideoAnalysisModel] = useState('gemini-2.5-flash-preview-05-20'); // Default to Gemini 2.5 Flash
  const [videoAnalysisTimeout, setVideoAnalysisTimeout] = useState('20'); // Default to 20 seconds timeout
  const [autoSelectDefaultPreset, setAutoSelectDefaultPreset] = useState(false); // Default to false
  const [optimizeVideos, setOptimizeVideos] = useState(true); // Default to optimizing videos
  const [optimizedResolution, setOptimizedResolution] = useState('360p'); // Default to 360p
  const [useOptimizedPreview, setUseOptimizedPreview] = useState(true); // Default to optimized video in preview
  const [isFactoryResetting, setIsFactoryResetting] = useState(false); // State for factory reset process
  const [transcriptionPrompt, setTranscriptionPrompt] = useState(DEFAULT_TRANSCRIPTION_PROMPT); // Custom transcription prompt

  // Save active tab to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('settings_last_active_tab', activeTab);
  }, [activeTab]);

  // Function to handle closing with animation
  const handleClose = useCallback(() => {
    // Start the closing animation
    setIsClosing(true);

    // Wait for the animation to complete before actually closing
    setTimeout(() => {
      onClose();
    }, 300); // Match this with the CSS transition duration
  }, [onClose]);

  // Add ESC key handler to close the modal
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape' && !isClosing) {
        handleClose();
      }
    };

    // Add event listener when the component mounts
    document.addEventListener('keydown', handleEscKey);

    // Remove event listener when the component unmounts
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [onClose, isClosing, handleClose]);

  // Store original settings for comparison
  const [originalSettings, setOriginalSettings] = useState({
    geminiApiKey: '',
    youtubeApiKey: '',
    geniusApiKey: '',
    segmentDuration: 5,
    geminiModel: 'gemini-2.0-flash',
    timeFormat: 'hms',
    showWaveform: true,
    segmentOffsetCorrection: -3.0,
    transcriptionPrompt: DEFAULT_TRANSCRIPTION_PROMPT,
    useOAuth: false,
    youtubeClientId: '',
    youtubeClientSecret: '',
    useVideoAnalysis: true,
    videoAnalysisModel: 'gemini-2.5-flash-preview-05-20',
    videoAnalysisTimeout: '20',
    autoSelectDefaultPreset: false,
    optimizeVideos: true,
    optimizedResolution: '360p',
    useOptimizedPreview: true
  });

  // Listen for system theme changes and apply initial theme
  useEffect(() => {
    // Set up system theme change listener
    const cleanup = setupSystemThemeListener(setTheme);

    // Handle initial theme setup
    const savedTheme = initializeTheme();
    setTheme(savedTheme);

    return cleanup;
  }, []);

  // Load saved settings on component mount
  useEffect(() => {
    const loadSettings = () => {
      // Get the current active Gemini API key from the key manager
      const savedGeminiKey = getCurrentKey() || '';
      const savedYoutubeKey = localStorage.getItem('youtube_api_key') || '';
      const savedGeniusKey = localStorage.getItem('genius_token') || '';
      const savedSegmentDuration = parseInt(localStorage.getItem('segment_duration') || '5');
      const savedGeminiModel = localStorage.getItem('gemini_model') || 'gemini-2.0-flash';
      const savedTimeFormat = localStorage.getItem('time_format') || 'hms';
      const savedShowWaveform = localStorage.getItem('show_waveform') !== 'false'; // Default to true if not set
      const savedOffsetCorrection = parseFloat(localStorage.getItem('segment_offset_correction') || '-3.0');
      const savedUseVideoAnalysis = localStorage.getItem('use_video_analysis') !== 'false'; // Default to true if not set
      const savedVideoAnalysisModel = localStorage.getItem('video_analysis_model') || 'gemini-2.0-flash'; // Default to Flash
      const savedVideoAnalysisTimeout = localStorage.getItem('video_analysis_timeout') || '20'; // Default to 20 seconds timeout
      const savedAutoSelectDefaultPreset = localStorage.getItem('auto_select_default_preset') === 'true'; // Default to false
      const savedTranscriptionPrompt = localStorage.getItem('transcription_prompt') || DEFAULT_TRANSCRIPTION_PROMPT;
      const savedUseOAuth = localStorage.getItem('use_youtube_oauth') === 'true';
      const savedOptimizeVideos = localStorage.getItem('optimize_videos') !== 'false'; // Default to true if not set
      const savedOptimizedResolution = localStorage.getItem('optimized_resolution') || '360p';
      const savedUseOptimizedPreview = localStorage.getItem('use_optimized_preview') !== 'false'; // Default to true if not set
      const { clientId, clientSecret } = getClientCredentials();
      const authenticated = hasValidTokens();

      // Original settings will be set after all state updates

      setGeminiApiKey(savedGeminiKey);
      setYoutubeApiKey(savedYoutubeKey);
      setGeniusApiKey(savedGeniusKey);
      setSegmentDuration(savedSegmentDuration);
      setGeminiModel(savedGeminiModel);
      setTimeFormat(savedTimeFormat);
      setShowWaveform(savedShowWaveform);
      setSegmentOffsetCorrection(savedOffsetCorrection);
      setUseVideoAnalysis(savedUseVideoAnalysis);
      setVideoAnalysisModel(savedVideoAnalysisModel);
      setVideoAnalysisTimeout(savedVideoAnalysisTimeout);
      setAutoSelectDefaultPreset(savedAutoSelectDefaultPreset);
      setTranscriptionPrompt(savedTranscriptionPrompt);
      setUseOAuth(savedUseOAuth);
      setYoutubeClientId(clientId);
      setYoutubeClientSecret(clientSecret);
      setIsAuthenticated(authenticated);
      setOptimizeVideos(savedOptimizeVideos);
      setOptimizedResolution(savedOptimizedResolution);
      setUseOptimizedPreview(savedUseOptimizedPreview);
      setHasChanges(false); // Reset changes flag when loading settings

      // Set original settings to match loaded settings
      setOriginalSettings({
        geminiApiKey: savedGeminiKey,
        youtubeApiKey: savedYoutubeKey,
        geniusApiKey: savedGeniusKey,
        segmentDuration: savedSegmentDuration,
        geminiModel: savedGeminiModel,
        timeFormat: savedTimeFormat,
        showWaveform: savedShowWaveform,
        segmentOffsetCorrection: savedOffsetCorrection,
        transcriptionPrompt: savedTranscriptionPrompt,
        useOAuth: savedUseOAuth,
        youtubeClientId: clientId,
        youtubeClientSecret: clientSecret,
        useVideoAnalysis: savedUseVideoAnalysis,
        videoAnalysisModel: savedVideoAnalysisModel,
        videoAnalysisTimeout: savedVideoAnalysisTimeout,
        autoSelectDefaultPreset: savedAutoSelectDefaultPreset,
        optimizeVideos: savedOptimizeVideos,
        optimizedResolution: savedOptimizedResolution,
        useOptimizedPreview: savedUseOptimizedPreview
      });

      // Mark settings as loaded
      setIsSettingsLoaded(true);
    };

    // Load settings initially
    loadSettings();

    // Check for OAuth success flag
    const oauthSuccess = localStorage.getItem('oauth_auth_success') === 'true';
    if (oauthSuccess) {
      // Refresh authentication status
      setIsAuthenticated(hasValidTokens());
    }

    // Set up event listener for storage changes
    const handleStorageChange = (event) => {
      if (event.key === 'youtube_oauth_token' || event.key === 'oauth_auth_success') {
        setIsAuthenticated(hasValidTokens());
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Clean up
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Function to toggle theme
  const handleToggleTheme = () => {
    const newTheme = toggleThemeUtil(theme, setTheme);
    setTheme(newTheme);
  };

  // Handle factory reset
  const handleFactoryReset = async () => {
    if (window.confirm(t('settings.confirmFactoryReset', 'Are you sure you want to perform a factory reset? This will clear all cache files and browser data. This cannot be undone.'))) {
      setIsFactoryResetting(true);

      try {
        // 1. Clear server-side cache
        const cacheResponse = await fetch(`${API_BASE_URL}/clear-cache`, {
          method: 'DELETE'
        });

        if (!cacheResponse.ok) {
          throw new Error('Failed to clear server cache');
        }

        // 2. Clear all localStorage items
        localStorage.clear();

        // 3. Clear IndexedDB if used
        const databases = await window.indexedDB.databases();
        databases.forEach(db => {
          window.indexedDB.deleteDatabase(db.name);
        });

        // 4. Show success message
        alert(t('settings.factoryResetSuccess', 'Factory reset completed successfully. The application will now reload.'));

        // 5. Reload the page to apply changes
        window.location.reload();
      } catch (error) {
        console.error('Error during factory reset:', error);
        alert(t('settings.factoryResetError', 'Error during factory reset: {{errorMessage}}', { errorMessage: error.message }));
        setIsFactoryResetting(false);
      }
    }
  };

  // Effect to check for changes in settings
  useEffect(() => {
    // Only check for changes if settings have been loaded
    if (!isSettingsLoaded) return;

    // Compare current settings with original settings
    const settingsChanged =
      geminiApiKey !== originalSettings.geminiApiKey ||
      youtubeApiKey !== originalSettings.youtubeApiKey ||
      geniusApiKey !== originalSettings.geniusApiKey ||
      segmentDuration !== originalSettings.segmentDuration ||
      geminiModel !== originalSettings.geminiModel ||
      timeFormat !== originalSettings.timeFormat ||
      showWaveform !== originalSettings.showWaveform ||
      segmentOffsetCorrection !== originalSettings.segmentOffsetCorrection ||
      transcriptionPrompt !== originalSettings.transcriptionPrompt ||
      useOAuth !== originalSettings.useOAuth ||
      youtubeClientId !== originalSettings.youtubeClientId ||
      youtubeClientSecret !== originalSettings.youtubeClientSecret ||
      useVideoAnalysis !== originalSettings.useVideoAnalysis ||
      videoAnalysisModel !== originalSettings.videoAnalysisModel ||
      videoAnalysisTimeout !== originalSettings.videoAnalysisTimeout ||
      autoSelectDefaultPreset !== originalSettings.autoSelectDefaultPreset ||
      optimizeVideos !== originalSettings.optimizeVideos ||
      optimizedResolution !== originalSettings.optimizedResolution ||
      useOptimizedPreview !== originalSettings.useOptimizedPreview;

    setHasChanges(settingsChanged);
  }, [isSettingsLoaded, geminiApiKey, youtubeApiKey, geniusApiKey, segmentDuration, geminiModel, timeFormat, showWaveform,
      segmentOffsetCorrection, transcriptionPrompt, useOAuth, youtubeClientId,
      youtubeClientSecret, useVideoAnalysis, videoAnalysisModel, videoAnalysisTimeout, autoSelectDefaultPreset,
      optimizeVideos, optimizedResolution, useOptimizedPreview, originalSettings]);

  // Handle save button click
  const handleSave = async () => {
    // Save settings to localStorage
    localStorage.setItem('segment_duration', segmentDuration.toString());
    localStorage.setItem('gemini_model', geminiModel);
    localStorage.setItem('genius_token', geniusApiKey);
    localStorage.setItem('time_format', timeFormat);
    localStorage.setItem('show_waveform', showWaveform.toString());
    localStorage.setItem('segment_offset_correction', segmentOffsetCorrection.toString());
    localStorage.setItem('transcription_prompt', transcriptionPrompt);
    localStorage.setItem('use_youtube_oauth', useOAuth.toString());
    localStorage.setItem('use_video_analysis', useVideoAnalysis.toString());
    localStorage.setItem('video_analysis_model', videoAnalysisModel);
    localStorage.setItem('video_analysis_timeout', videoAnalysisTimeout);
    localStorage.setItem('auto_select_default_preset', autoSelectDefaultPreset.toString());
    localStorage.setItem('optimize_videos', optimizeVideos.toString());
    localStorage.setItem('optimized_resolution', optimizedResolution);
    localStorage.setItem('use_optimized_preview', useOptimizedPreview.toString());
    // Save the Gemini API key to the key manager
    // The key manager will handle updating the legacy key for backward compatibility
    const allKeys = getAllKeys();
    if (geminiApiKey && !allKeys.includes(geminiApiKey)) {
      const updatedKeys = [...allKeys, geminiApiKey];
      saveAllKeys(updatedKeys);
    }

    localStorage.setItem('youtube_api_key', youtubeApiKey);

    // Save localStorage data to server
    try {
      // Collect all localStorage data
      const localStorageData = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        localStorageData[key] = localStorage.getItem(key);
      }

      // Add specific keys for the server
      localStorageData.gemini_token = geminiApiKey;
      localStorageData.genius_token = geniusApiKey;

      // Send to server
      const response = await fetch(process.env.BACKEND_URL+'/api/save-local-storage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(localStorageData),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings to server');
      }


    } catch (error) {
      console.error('Error saving settings to server:', error);
    }

    // Notify parent component about API keys, segment duration, model, time format, and video optimization settings
    onSave(geminiApiKey, youtubeApiKey, geniusApiKey, segmentDuration, geminiModel, timeFormat, showWaveform, optimizeVideos, optimizedResolution, useOptimizedPreview);

    // Update original settings to match current settings
    setOriginalSettings({
      geminiApiKey,
      youtubeApiKey,
      geniusApiKey,
      segmentDuration,
      geminiModel,
      timeFormat,
      showWaveform,
      segmentOffsetCorrection,
      transcriptionPrompt,
      useOAuth,
      youtubeClientId,
      youtubeClientSecret,
      useVideoAnalysis,
      videoAnalysisModel,
      videoAnalysisTimeout,
      autoSelectDefaultPreset,
      optimizeVideos,
      optimizedResolution,
      useOptimizedPreview
    });

    // Reset changes flag and mark settings as loaded
    setHasChanges(false);
    setIsSettingsLoaded(true);

    handleClose();
  };

  return (
    <div className={`settings-modal-overlay ${isClosing ? 'closing' : ''}`}>
      <div className={`settings-modal ${isClosing ? 'closing' : ''}`} noValidate data-no-autofill>
        <div className="settings-header">
          <h2>{t('settings.title', 'Settings')}</h2>

          {/* Tab Navigation */}
          <div className="settings-tabs" ref={tabsRef} title={t('settings.dragToScroll', 'Drag to scroll tabs')}>
            <div className="pill-background"></div>
            <button
              className={`settings-tab ${activeTab === 'api-keys' ? 'active' : ''}`}
              onClick={() => setActiveTab('api-keys')}
            >
              <ApiKeyIcon />
              {t('settings.apiKeys', 'API Keys')}
            </button>
            <button
              className={`settings-tab ${activeTab === 'video-processing' ? 'active' : ''}`}
              onClick={() => setActiveTab('video-processing')}
            >
              <ProcessingIcon />
              {t('settings.videoProcessing', 'Video Processing')}
            </button>
            <button
              className={`settings-tab ${activeTab === 'prompts' ? 'active' : ''}`}
              onClick={() => setActiveTab('prompts')}
            >
              <PromptIcon />
              {t('settings.prompts', 'Prompts')}
            </button>
            <button
              className={`settings-tab ${activeTab === 'cache' ? 'active' : ''}`}
              onClick={() => setActiveTab('cache')}
            >
              <CacheIcon />
              {t('settings.cache', 'Cache')}
            </button>
            <button
              className={`settings-tab ${activeTab === 'model-management' ? 'active' : ''}`}
              onClick={() => setActiveTab('model-management')}
            >
              <ModelIcon />
              {t('settings.modelManagement', 'Narration Models')}
            </button>
            <button
              className={`settings-tab ${activeTab === 'about' ? 'active' : ''}`}
              onClick={() => {
                // Select a random background when clicking on the About tab
                if (activeTab !== 'about') {
                  // Possible background types: default, alternative, 1, 2, 3, 4, 5
                  const allBackgroundOptions = ['default', 'alternative', '1', '2', '3', '4', '5'];

                  // Get the history of recently used backgrounds from localStorage
                  let recentBackgrounds = [];
                  try {
                    const storedHistory = localStorage.getItem('about_background_history');
                    if (storedHistory) {
                      recentBackgrounds = JSON.parse(storedHistory);
                    }
                  } catch (e) {
                    console.error('Error parsing background history:', e);
                    // If there's an error, just use an empty array
                    recentBackgrounds = [];
                  }

                  // Filter out recently used backgrounds (if we have enough options)
                  // We'll avoid reusing the last 3 backgrounds if possible
                  let availableOptions = [...allBackgroundOptions];

                  // Only filter if we have enough options to choose from
                  if (allBackgroundOptions.length > recentBackgrounds.length) {
                    availableOptions = allBackgroundOptions.filter(
                      option => !recentBackgrounds.includes(option)
                    );
                  }

                  // If we somehow filtered out all options, use all backgrounds
                  if (availableOptions.length === 0) {
                    availableOptions = [...allBackgroundOptions];
                  }

                  // Select a random background from available options
                  const randomBackground = availableOptions[Math.floor(Math.random() * availableOptions.length)];

                  // Update the history - add the new background and keep only the last 3
                  recentBackgrounds.unshift(randomBackground);
                  if (recentBackgrounds.length > 3) {
                    recentBackgrounds = recentBackgrounds.slice(0, 3);
                  }

                  // Save the updated history
                  localStorage.setItem('about_background_history', JSON.stringify(recentBackgrounds));

                  // Save the selected background
                  localStorage.setItem('about_background_type', randomBackground);

                  // Update the state
                  setBackgroundType(randomBackground);
                }
                setActiveTab('about');
              }}
            >
              <AboutIcon />
              {t('settings.about', 'About')}
            </button>
          </div>

          <button
            className="close-btn"
            onClick={handleClose}
            aria-label={t('common.close', 'Close')}
            title={t('common.close', 'Close')}
          >
            &times;
          </button>
        </div>

        <div className="settings-content">
          {/* API Keys Tab Content */}
          <div key={`settings-tab-api-keys-${activeTab}`} className={`settings-tab-content ${activeTab === 'api-keys' ? 'active' : ''} settings-tab-content-slide-${animationDirection}`}>
            <ApiKeysTab
              geminiApiKey={geminiApiKey}
              setGeminiApiKey={setGeminiApiKey}
              youtubeApiKey={youtubeApiKey}
              setYoutubeApiKey={setYoutubeApiKey}
              geniusApiKey={geniusApiKey}
              setGeniusApiKey={setGeniusApiKey}
              showGeminiKey={showGeminiKey}
              setShowGeminiKey={setShowGeminiKey}
              showYoutubeKey={showYoutubeKey}
              setShowYoutubeKey={setShowYoutubeKey}
              showGeniusKey={showGeniusKey}
              setShowGeniusKey={setShowGeniusKey}
              useOAuth={useOAuth}
              setUseOAuth={setUseOAuth}
              youtubeClientId={youtubeClientId}
              setYoutubeClientId={setYoutubeClientId}
              youtubeClientSecret={youtubeClientSecret}
              setYoutubeClientSecret={setYoutubeClientSecret}
              showClientId={showClientId}
              setShowClientId={setShowClientId}
              showClientSecret={showClientSecret}
              setShowClientSecret={setShowClientSecret}
              isAuthenticated={isAuthenticated}
              setIsAuthenticated={setIsAuthenticated}
              apiKeysSet={apiKeysSet}
              setApiKeysSet={setApiKeysSet}
            />
          </div>

          {/* Video Processing Tab Content */}
          <div key={`settings-tab-video-processing-${activeTab}`} className={`settings-tab-content ${activeTab === 'video-processing' ? 'active' : ''} settings-tab-content-slide-${animationDirection}`}>
            <VideoProcessingTab
              segmentDuration={segmentDuration}
              setSegmentDuration={setSegmentDuration}
              geminiModel={geminiModel}
              setGeminiModel={setGeminiModel}
              timeFormat={timeFormat}
              setTimeFormat={setTimeFormat}
              showWaveform={showWaveform}
              setShowWaveform={setShowWaveform}
              useVideoAnalysis={useVideoAnalysis}
              setUseVideoAnalysis={setUseVideoAnalysis}
              videoAnalysisModel={videoAnalysisModel}
              setVideoAnalysisModel={setVideoAnalysisModel}
              videoAnalysisTimeout={videoAnalysisTimeout}
              setVideoAnalysisTimeout={setVideoAnalysisTimeout}
              autoSelectDefaultPreset={autoSelectDefaultPreset}
              setAutoSelectDefaultPreset={setAutoSelectDefaultPreset}
              optimizeVideos={optimizeVideos}
              setOptimizeVideos={setOptimizeVideos}
              optimizedResolution={optimizedResolution}
              setOptimizedResolution={setOptimizedResolution}
              useOptimizedPreview={useOptimizedPreview}
              setUseOptimizedPreview={setUseOptimizedPreview}
            />
          </div>

          {/* Prompts Tab Content */}
          <div key={`settings-tab-prompts-${activeTab}`} className={`settings-tab-content ${activeTab === 'prompts' ? 'active' : ''} settings-tab-content-slide-${animationDirection}`}>
            <PromptsTab
              transcriptionPrompt={transcriptionPrompt}
              setTranscriptionPrompt={setTranscriptionPrompt}
            />
          </div>

          {/* Cache Management Tab Content */}
          <div key={`settings-tab-cache-${activeTab}`} className={`settings-tab-content ${activeTab === 'cache' ? 'active' : ''} settings-tab-content-slide-${animationDirection}`}>
            <CacheTab />
          </div>

          {/* Model Management Tab Content */}
          <div key={`settings-tab-model-management-${activeTab}`} className={`settings-tab-content ${activeTab === 'model-management' ? 'active' : ''} settings-tab-content-slide-${animationDirection}`}>
            <ModelManagementTab />
          </div>

          {/* About Tab Content */}
          <div key={`settings-tab-about-${activeTab}`} className={`settings-tab-content ${activeTab === 'about' ? 'active' : ''} settings-tab-content-slide-${animationDirection}`}>
            <AboutTab backgroundType={backgroundType} />
          </div>
        </div>

        <div className="settings-footer">
          <div className="settings-footer-left">
            {/* Theme toggle and language selector */}
            <div className="settings-footer-controls">
              <button
                className="theme-toggle"
                onClick={handleToggleTheme}
                aria-label={getThemeLabel(theme, t)}
                title={getThemeLabel(theme, t)}
              >
                {getThemeIcon(theme)}
              </button>
              <LanguageSelector isDropup={true} />
            </div>

            {/* Factory reset button */}
            <button
              className="factory-reset-btn"
              onClick={handleFactoryReset}
              disabled={isFactoryResetting}
              title={t('settings.factoryResetTooltip', 'Reset application to factory settings')}
            >
              {isFactoryResetting ? (
                <>
                  <span className="loading-spinner"></span>
                  {t('settings.resetting', 'Resetting...')}
                </>
              ) : (
                t('settings.factoryReset', 'Factory Reset')
              )}
            </button>
          </div>
          <div className="settings-footer-right">
            <button
              className="cancel-btn"
              onClick={handleClose}
              title={t('settings.pressEscToClose', 'Press ESC to close')}
            >
              {t('common.cancel', 'Cancel')} <span className="key-hint">(ESC)</span>
            </button>
            <button
              className="save-btn"
              onClick={handleSave}
              disabled={!hasChanges}
              title={!hasChanges ? t('settings.noChanges', 'No changes to save') : t('settings.saveChanges', 'Save changes')}
            >
              {t('common.save', 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
