import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../styles/LyricsDisplay.css';
import TimelineVisualization from './lyrics/TimelineVisualization';
import LyricItem from './lyrics/LyricItem';
import LyricsHeader from './lyrics/LyricsHeader';
import { useLyricsEditor } from '../hooks/useLyricsEditor';
import { VariableSizeList as List } from 'react-window';
import { extractYoutubeVideoId } from '../utils/videoDownloader';
import { downloadTXT, downloadSRT, downloadJSON } from '../utils/fileUtils';
import { completeDocument, summarizeDocument } from '../services/geminiService';
import DownloadOptionsModal from './DownloadOptionsModal';

// Helper function to download files
const downloadFile = (content, filename, type = 'text/plain') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Virtualized row renderer for lyrics
const VirtualizedLyricRow = ({ index, style, data }) => {
  const {
    lyrics,
    currentIndex,
    currentTime,
    allowEditing,
    isDragging,
    onLyricClick,
    onMouseDown,
    getLastDragEnd,
    onDelete,
    onTextEdit,
    onInsert,
    onMerge,
    timeFormat
  } = data;

  const lyric = lyrics[index];
  const hasNextLyric = index < lyrics.length - 1;

  return (
    <div style={style}>
      <LyricItem
        key={index}
        lyric={lyric}
        index={index}
        isCurrentLyric={index === currentIndex}
        currentTime={currentTime}
        allowEditing={allowEditing}
        isDragging={isDragging}
        onLyricClick={onLyricClick}
        onMouseDown={onMouseDown}
        getLastDragEnd={getLastDragEnd}
        onDelete={onDelete}
        onTextEdit={onTextEdit}
        onInsert={onInsert}
        onMerge={onMerge}
        hasNextLyric={hasNextLyric}
        timeFormat={timeFormat}
      />
    </div>
  );
};

const LyricsDisplay = ({
  matchedLyrics,
  currentTime,
  onLyricClick,
  duration,
  onUpdateLyrics,
  allowEditing = false,
  seekTime = null,
  timeFormat = 'seconds',
  onSaveSubtitles = null, // New callback for when subtitles are saved
  videoSource = null, // Video source URL for audio analysis
  translatedSubtitles = null, // Translated subtitles
  videoTitle = 'subtitles' // Video title for download filenames
}) => {
  const { t } = useTranslation();
  // Initialize zoom with a function that calculates the minimum zoom based on duration
  const [zoom, setZoom] = useState(() => {
    // Try to get the duration from the video element if it exists
    const videoElement = document.querySelector('video');
    if (videoElement && videoElement.duration && !isNaN(videoElement.duration)) {
      // Calculate minimum zoom based on duration
      const minZoom = videoElement.duration <= 300 ? 1 : videoElement.duration / 300;
      return minZoom;
    }
    // Default to 1 if we can't determine the duration yet
    return 1;
  });
  const [panOffset, setPanOffset] = useState(0);
  const [centerTimelineAt, setCenterTimelineAt] = useState(null);
  const rowHeights = useRef({});
  const [txtContent, setTxtContent] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [splitDuration, setSplitDuration] = useState(() => {
    // Get the split duration from localStorage or use default (0 = no split)
    return parseInt(localStorage.getItem('consolidation_split_duration') || '0');
  });
  const [consolidationStatus, setConsolidationStatus] = useState('');
  const [showWaveform, setShowWaveform] = useState(() => {
    // Load from localStorage, default to true if not set
    return localStorage.getItem('show_waveform') !== 'false';
  });
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(() => {
    // Load from localStorage, default to true (auto-scroll enabled) if not set
    return localStorage.getItem('lyrics_auto_scroll') !== 'false';
  });

  // Function to calculate row height based on text content
  const getRowHeight = index => {
    // If we already calculated this height, return it
    if (rowHeights.current[index] !== undefined) {
      return rowHeights.current[index];
    }

    const lyric = matchedLyrics[index];
    if (!lyric) return 50; // Default height

    // Calculate height based on text length
    const text = lyric.text || '';
    const lineCount = text.split('\n').length; // Count actual line breaks
    const estimatedLines = Math.ceil(text.length / 40); // Estimate based on characters per line
    const lines = Math.max(lineCount, estimatedLines);

    // Base height + additional height per line
    const height = 50 + (lines > 1 ? (lines - 1) * 20 : 0);

    // Cache the calculated height
    rowHeights.current[index] = height;
    return height;
  };

  // Reset row heights when lyrics change
  useEffect(() => {
    rowHeights.current = {};
    if (listRef.current) {
      listRef.current.resetAfterIndex(0);
    }
  }, [matchedLyrics]);

  // Update zoom level when duration changes
  useEffect(() => {
    if (duration) {
      // Calculate minimum zoom based on duration
      const minZoom = duration <= 300 ? 1 : duration / 300;

      // Only update if the current zoom is less than the minimum
      if (zoom < minZoom) {

        setZoom(minZoom);
      }
    }
  }, [duration, zoom]);

  // Listen for changes to the show_waveform setting in localStorage
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === 'show_waveform') {
        setShowWaveform(event.newValue !== 'false');
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Save auto-scroll setting to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('lyrics_auto_scroll', autoScrollEnabled.toString());
  }, [autoScrollEnabled]);

  // Listen for consolidation status updates
  useEffect(() => {
    const handleConsolidationStatus = (event) => {
      if (event.detail && event.detail.message) {
        setConsolidationStatus(event.detail.message);

        // Check if this is a completion message
        if (event.detail.message.includes('Processing completed for all')) {
          // Clear the status after a delay
          setTimeout(() => {
            setConsolidationStatus('');
          }, 3000);
        }
      }
    };

    window.addEventListener('consolidation-status', handleConsolidationStatus);

    return () => {
      window.removeEventListener('consolidation-status', handleConsolidationStatus);
    };
  }, []);

  // Gemini effects for the Download Center button have been removed to reduce lag

  const {
    lyrics,
    isSticky,
    setIsSticky,
    isAtOriginalState,
    isAtSavedState,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
    handleReset,
    startDrag,
    handleDrag,
    endDrag,
    isDragging,
    getLastDragEnd,
    handleDeleteLyric,
    handleTextEdit,
    handleInsertLyric,
    handleMergeLyrics,
    updateSavedLyrics
  } = useLyricsEditor(matchedLyrics, onUpdateLyrics);

  // Find current lyric index based on time
  const currentIndex = lyrics.findIndex((lyric, index) => {
    const nextLyric = lyrics[index + 1];
    // If there's a next lyric, use the middle point between current lyric's end and next lyric's start
    // Otherwise, use the current lyric's end time
    return currentTime >= lyric.start &&
      (nextLyric ? currentTime < (lyric.end + (nextLyric.start - lyric.end) / 2) : currentTime <= lyric.end);
  });

  // Reference to the virtualized list
  const listRef = useRef(null);

  // Auto-scroll to the current lyric with accurate positioning
  useEffect(() => {
    if (autoScrollEnabled && currentIndex >= 0 && listRef.current) {
      // Scroll to the current index in the virtualized list
      listRef.current.scrollToItem(currentIndex, 'center');
    }
  }, [currentIndex, autoScrollEnabled]);

  // Watch for seekTime changes to center the timeline
  useEffect(() => {
    if (seekTime !== null) {
      // Center the timeline on the seek time
      setCenterTimelineAt(seekTime);

    }
  }, [seekTime]);

  // Handle download request from modal
  const handleDownload = (source, format) => {
    const subtitlesToUse = source === 'translated' ? translatedSubtitles : lyrics;

    if (subtitlesToUse && subtitlesToUse.length > 0) {
      const langSuffix = source === 'translated' ? '_translated' : '';
      const baseFilename = `${videoTitle || 'subtitles'}${langSuffix}`;

      switch (format) {
        case 'srt':
          downloadSRT(subtitlesToUse, `${baseFilename}.srt`);
          break;
        case 'json':
          downloadJSON(subtitlesToUse, `${baseFilename}.json`);
          break;
        case 'txt':
          const content = downloadTXT(subtitlesToUse, `${baseFilename}.txt`);
          setTxtContent(content);
          break;
        default:
          break;
      }
    }
  };

  // Handle process request from modal
  const handleProcess = async (source, processType, model, splitDurationParam, customPrompt) => {
    const subtitlesToUse = source === 'translated' ? translatedSubtitles : lyrics;

    // Store the current source in localStorage for language detection
    localStorage.setItem('current_processing_source', source);

    if (!subtitlesToUse || subtitlesToUse.length === 0) return;

    // First, get the text content if we don't have it yet
    let textContent = txtContent;
    if (!textContent) {
      textContent = subtitlesToUse.map(subtitle => subtitle.text).join('\n\n');
      setTxtContent(textContent);
    }

    // Use the provided split duration or the state value
    const splitDurationToUse = splitDurationParam !== undefined ? splitDurationParam : splitDuration;

    // Save the split duration setting to localStorage
    localStorage.setItem('consolidation_split_duration', splitDurationToUse.toString());

    // Update the state
    setSplitDuration(splitDurationToUse);

    // Clear any previous status
    setConsolidationStatus('');

    try {
      let result;
      if (processType === 'consolidate') {
        result = await completeDocument(textContent, model, customPrompt, splitDurationToUse);
      } else if (processType === 'summarize') {
        result = await summarizeDocument(textContent, model, customPrompt);
      }

      // Check if the result is JSON and extract plain text
      if (result && typeof result === 'string' && (result.trim().startsWith('{') || result.trim().startsWith('['))) {
        try {
          const jsonResult = JSON.parse(result);


          // For summarize feature
          if (jsonResult.summary) {
            let plainText = jsonResult.summary;

            // Add key points if available
            if (jsonResult.keyPoints && Array.isArray(jsonResult.keyPoints) && jsonResult.keyPoints.length > 0) {
              plainText += '\n\nKey Points:\n';
              jsonResult.keyPoints.forEach((point, index) => {
                plainText += `\n${index + 1}. ${point}`;
              });
            }

            result = plainText;

          }
          // For consolidate feature
          else if (jsonResult.content) {
            result = jsonResult.content;

          }
          // For any other JSON structure
          else if (jsonResult.text) {
            result = jsonResult.text;

          }
        } catch (e) {

          // Keep the original result if parsing fails
        }
      }

      // Result is ready for download

      // Show a temporary success message
      const successMessage = document.createElement('div');
      successMessage.className = 'save-success-message';
      successMessage.textContent = processType === 'consolidate'
        ? t('output.documentCompleted', 'Document completed successfully')
        : t('output.summaryCompleted', 'Summary completed successfully');
      document.body.appendChild(successMessage);

      // Remove the message after 3 seconds
      setTimeout(() => {
        if (document.body.contains(successMessage)) {
          document.body.removeChild(successMessage);
        }
      }, 3000);

      // Download the processed document
      const langSuffix = source === 'translated' ? '_translated' : '';
      const filename = `${videoTitle || 'subtitles'}_${processType === 'consolidate' ? 'completed' : 'summary'}${langSuffix}.txt`;
      downloadFile(result, filename);
    } catch (error) {
      console.error(`Error ${processType === 'consolidate' ? 'completing' : 'summarizing'} document:`, error);

      // Show error status
      setConsolidationStatus(t('consolidation.error', 'Error processing document: {{message}}', { message: error.message }));
    } finally {
      // Processing is complete
    }
  };

  // Function to save current subtitles to cache
  const handleSave = async () => {
    try {
      // Get the current video source
      const currentVideoUrl = localStorage.getItem('current_youtube_url');
      const currentFileUrl = localStorage.getItem('current_file_url');
      let cacheId = null;

      if (currentVideoUrl) {
        // For YouTube videos
        cacheId = extractYoutubeVideoId(currentVideoUrl);
      } else if (currentFileUrl) {
        // For uploaded files, the cacheId is already stored
        cacheId = localStorage.getItem('current_file_cache_id');
      }

      if (!cacheId) {
        console.error('No cache ID found for current media');

        return;
      }

      // Check if we have latest segment subtitles in localStorage
      let subtitlesToSave = lyrics;
      try {
        const latestSubtitles = localStorage.getItem('latest_segment_subtitles');
        if (latestSubtitles) {
          const parsedSubtitles = JSON.parse(latestSubtitles);
          if (Array.isArray(parsedSubtitles) && parsedSubtitles.length > 0) {

            subtitlesToSave = parsedSubtitles;
            // Clear the localStorage entry to avoid using it again
            localStorage.removeItem('latest_segment_subtitles');
          }
        }
      } catch (e) {
        console.error('Error parsing latest subtitles from localStorage:', e);
      }

      // Save to cache
      const response = await fetch('process.env.BACKEND_URL/api/save-subtitles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cacheId,
          subtitles: subtitlesToSave
        })
      });

      const result = await response.json();
      if (result.success) {

        // Show a temporary success message
        const saveMessage = document.createElement('div');
        saveMessage.className = 'save-success-message';
        saveMessage.textContent = t('output.subtitlesSaved', 'Progress saved successfully');
        document.body.appendChild(saveMessage);

        // Remove the message after 3 seconds
        setTimeout(() => {
          if (document.body.contains(saveMessage)) {
            document.body.removeChild(saveMessage);
          }
        }, 3000);

        // Update the saved lyrics state in the editor
        updateSavedLyrics();

        // Call the callback if provided to update parent component state
        if (onSaveSubtitles) {
          onSaveSubtitles(subtitlesToSave);
        }

        // Dispatch custom events to notify that subtitles have been saved
        // These are used by various components including segment retry and aligned narration
        window.dispatchEvent(new CustomEvent('subtitles-saved', {
          detail: { success: true }
        }));

        // Also dispatch a subtitle-timing-changed event for the aligned narration component
        window.dispatchEvent(new CustomEvent('subtitle-timing-changed', {
          detail: {
            action: 'save',
            timestamp: Date.now(),
            subtitles: subtitlesToSave
          }
        }));
      } else {
        console.error('Failed to save subtitles:', result.error);
      }
    } catch (error) {
      console.error('Error saving subtitles:', error);
    }
  };

  // Setup drag event handlers with performance optimizations
  const handleMouseDown = (e, index, field) => {
    e.preventDefault();
    e.stopPropagation();
    startDrag(index, field, e.clientX, lyrics[index][field]);

    // Use passive event listeners for better performance
    document.addEventListener('mousemove', handleMouseMove, { passive: false });
    document.addEventListener('mouseup', handleMouseUp, { passive: false });

    // Add a class to the body to indicate dragging is in progress
    document.body.classList.add('lyrics-dragging');
  };

  // Use a throttled mouse move handler
  const lastMoveTimeRef = useRef(0);
  const handleMouseMove = (e) => {
    e.preventDefault();

    // Throttle mousemove events
    const now = performance.now();
    if (now - lastMoveTimeRef.current < 16) { // ~60fps
      return;
    }
    lastMoveTimeRef.current = now;

    // Use requestAnimationFrame for smoother updates
    requestAnimationFrame(() => {
      handleDrag(e.clientX, duration);
    });
  };

  const handleMouseUp = (e) => {
    e.preventDefault();
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.classList.remove('lyrics-dragging');
    endDrag();
  };

  return (
    <div className={`lyrics-display ${Object.keys(isDragging()).length > 0 ? 'dragging-active' : ''}`}>
      <div className="controls-timeline-container">
        <LyricsHeader
          allowEditing={allowEditing}
          isSticky={isSticky}
          setIsSticky={setIsSticky}
          canUndo={canUndo}
          canRedo={canRedo}
          isAtOriginalState={isAtOriginalState}
          isAtSavedState={isAtSavedState}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onReset={handleReset}
          onSave={handleSave}
          autoScrollEnabled={autoScrollEnabled}
          setAutoScrollEnabled={setAutoScrollEnabled}
        />

        <TimelineVisualization
          lyrics={lyrics}
          currentTime={currentTime}
          duration={duration}
          onTimelineClick={onLyricClick}
          zoom={zoom}
          setZoom={setZoom}
          panOffset={panOffset}
          setPanOffset={setPanOffset}
          centerOnTime={centerTimelineAt}
          timeFormat={timeFormat}
          videoSource={videoSource}
          showWaveform={showWaveform}
        />
      </div>

      <div className="lyrics-container-wrapper">
        {lyrics.length > 0 && (
          <List
            ref={listRef}
            className="lyrics-container"
            height={300} // Reduced height for more compact view
            width="100%"
            itemCount={lyrics.length}
            itemSize={getRowHeight} // Dynamic row heights based on content
            overscanCount={5} // Number of items to render outside of the visible area
            itemData={{
              lyrics,
              currentIndex,
              currentTime,
              allowEditing,
              isDragging,
              onLyricClick: (time) => {
                // Center the timeline on the clicked lyric
                setCenterTimelineAt(time);
                // Reset the center time in the next frame to allow future clicks to work
                requestAnimationFrame(() => {
                  setCenterTimelineAt(null);
                });
                // Call the original onLyricClick function
                onLyricClick(time);
              },
              onMouseDown: handleMouseDown,
              getLastDragEnd,
              onDelete: handleDeleteLyric,
              onTextEdit: handleTextEdit,
              onInsert: handleInsertLyric,
              onMerge: handleMergeLyrics,
              timeFormat
            }}
          >
            {VirtualizedLyricRow}
          </List>
        )}
      </div>

      <div className="help-text-container">
        {allowEditing && (
          <div className="help-text">
            <p>{t('lyrics.timingInstructions')}</p>
          </div>
        )}

        <div className="download-buttons">
          <button
            className="download-btn"
            onClick={() => setIsModalOpen(true)}
            disabled={!lyrics.length}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>{t('download.downloadCenter', 'Download Center')}</span>
          </button>

          {/* Show consolidation status if available */}
          {consolidationStatus && (
            <div className="consolidation-status">
              <div className="status-spinner"></div>
              <span>{consolidationStatus}</span>
            </div>
          )}

          {/* Download Options Modal */}
          <DownloadOptionsModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onDownload={handleDownload}
            onProcess={handleProcess}
            hasTranslation={translatedSubtitles && translatedSubtitles.length > 0}
            hasOriginal={lyrics && lyrics.length > 0}
          />
        </div>
      </div>
    </div>
  );
};

export default LyricsDisplay;