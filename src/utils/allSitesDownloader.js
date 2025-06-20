/**
 * Utility functions for downloading and handling videos from any site using yt-dlp
 */

// Global download queue to track video download status
const downloadQueue = {};

// Track active download intervals for cancellation
const activeDownloadIntervals = {};

// Server URL for the local download server
const SERVER_URL = process.env.REACT_APP_BACKEND_URL+'';

/**
 * Check if a video is already downloaded
 * @param {string} videoId - The video ID
 * @returns {Promise<boolean>} - True if the video is already downloaded
 */
const isVideoAlreadyDownloaded = async (videoId) => {
  try {
    const response = await fetch(`${SERVER_URL}/videos/${videoId}.mp4`, {
      method: 'HEAD',
    });
    return response.ok;
  } catch (error) {
    console.error('Error checking if video is downloaded:', error);
    return false;
  }
};

/**
 * Check download progress
 * @param {string} videoId - The video ID
 * @returns {Promise<number>} - Download progress (0-100)
 */
const checkDownloadProgress = async (videoId) => {
  if (!downloadQueue[videoId]) {
    return 0;
  }

  // If the video is already downloaded, return 100%
  if (downloadQueue[videoId].status === 'completed') {
    return 100;
  }

  // If the video is downloading, simulate progress
  if (downloadQueue[videoId].status === 'downloading') {
    // Increment progress by a small amount each time
    downloadQueue[videoId].progress = Math.min(
      95, // Cap at 95% until we confirm it's done
      downloadQueue[videoId].progress + 1
    );
    return downloadQueue[videoId].progress;
  }

  return 0;
};

/**
 * Cancel a video download
 * @param {string} videoId - The video ID
 */
const cancelDownload = async (videoId) => {
  if (!downloadQueue[videoId]) {
    return;
  }

  // Clear the progress check interval
  if (activeDownloadIntervals[videoId]) {
    clearInterval(activeDownloadIntervals[videoId]);
    delete activeDownloadIntervals[videoId];
  }

  // Send cancel request to server
  try {
    await fetch(`${SERVER_URL}/api/cancel-generic-download/${videoId}`, {
      method: 'POST',
    });
  } catch (error) {
    console.error('Error cancelling download:', error);
  }

  // Mark as cancelled in the queue
  downloadQueue[videoId].status = 'cancelled';
  downloadQueue[videoId].progress = 0;
};

/**
 * Generate a video ID from a URL
 * @param {string} url - The video URL
 * @returns {string} - A unique ID for the video
 */
const generateVideoId = (url) => {
  try {
    // First, try to create a more reliable ID
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    const path = urlObj.pathname.replace(/\//g, '_');

    // Create a base ID from domain and path
    const baseId = `${domain}${path}`.replace(/[^a-zA-Z0-9]/g, '_');

    // Add a timestamp to ensure uniqueness
    const timestamp = Date.now();

    // Combine everything into a valid ID
    return `site_${baseId}_${timestamp}`;
  } catch (error) {
    console.error('Error generating video ID:', error);
    // Fallback to a simpler ID generation
    const timestamp = Date.now();
    return `site_${timestamp}`;
  }
};

/**
 * Downloads a video from any site and waits for completion
 * @param {string} url - The video URL
 * @param {Function} onProgress - Progress callback (0-100)
 * @param {boolean} forceRefresh - Force a fresh download even if the video exists in cache
 * @returns {Promise<string>} - A promise that resolves to a video URL
 */
export const downloadGenericVideo = async (url, onProgress = () => {}, forceRefresh = false) => {
  // Generate a unique ID for this URL
  const videoId = generateVideoId(url);



  // If forceRefresh is true, remove any existing download from the queue
  if (forceRefresh && downloadQueue[videoId]) {

    delete downloadQueue[videoId];
  }

  // If this video is already in the download queue, return its status
  if (downloadQueue[videoId]) {
    // If it's already completed, return the URL
    if (downloadQueue[videoId].status === 'completed') {
      // Create a File object for the downloaded video
      try {
        // Use a direct URL to the server to avoid any caching issues
        const response = await fetch(`${SERVER_URL}/videos/${videoId}.mp4?t=${Date.now()}`, {
          method: 'GET',
          cache: 'no-cache' // Ensure we don't get a cached response
        });

        if (response.ok) {

          const blob = await response.blob();


          // Check if the blob has a reasonable size
          if (blob.size < 100 * 1024) { // Less than 100KB
            console.error(`Downloaded blob is too small (${blob.size} bytes), likely not a valid video`);

            // Try one more time with a direct server URL


            const retryResponse = await fetch(`${SERVER_URL}/videos/${videoId}.mp4?t=${Date.now()}`, {
              method: 'GET',
              cache: 'no-cache'
            });

            if (retryResponse.ok) {

              const retryBlob = await retryResponse.blob();


              // Final check on the blob size
              if (retryBlob.size < 100 * 1024) { // Less than 100KB
                throw new Error(`Downloaded blob is too small (${retryBlob.size} bytes), likely not a valid video`);
              }

              const file = new File([retryBlob], `${videoId}.mp4`, { type: 'video/mp4' });

              return file;
            } else {
              throw new Error(`Error fetching video file on retry: ${retryResponse.status} ${retryResponse.statusText}`);
            }
          }

          const file = new File([blob], `${videoId}.mp4`, { type: 'video/mp4' });

          return file;
        } else {
          console.error(`Error fetching video file: ${response.status} ${response.statusText}`);
          throw new Error(`Error fetching video file: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.error('Error creating File object:', error);
        throw error;
      }
    }

    // If it's downloading, set up progress reporting
    if (downloadQueue[videoId].status === 'downloading') {
      // Set up progress reporting if not already set
      if (!activeDownloadIntervals[videoId]) {
        activeDownloadIntervals[videoId] = setInterval(() => {
          checkDownloadProgress(videoId).then(progress => {
            onProgress(progress);
          });
        }, 1000);
      }

      // Return a promise that resolves when the download is complete
      return new Promise((resolve, reject) => {
        downloadQueue[videoId].resolve = resolve;
        downloadQueue[videoId].reject = reject;
      });
    }

    // If it was cancelled, restart the download
    if (downloadQueue[videoId].status === 'cancelled') {
      delete downloadQueue[videoId];
    }
  }

  // Initialize the download queue entry
  downloadQueue[videoId] = {
    status: 'checking',
    progress: 0,
    forceRefresh
  };

  try {
    // Check if the video is already downloaded
    const isDownloaded = await isVideoAlreadyDownloaded(videoId);

    if (isDownloaded && !forceRefresh) {

      downloadQueue[videoId].status = 'completed';
      downloadQueue[videoId].progress = 100;
      onProgress(100);

      // Create a File object for the downloaded video
      try {
        // Use a direct URL to the server to avoid any caching issues
        const response = await fetch(`${SERVER_URL}/videos/${videoId}.mp4?t=${Date.now()}`, {
          method: 'GET',
          cache: 'no-cache' // Ensure we don't get a cached response
        });

        if (response.ok) {

          const blob = await response.blob();


          // Check if the blob has a reasonable size
          if (blob.size < 100 * 1024) { // Less than 100KB
            console.error(`Downloaded blob is too small (${blob.size} bytes), likely not a valid video`);

            // Try one more time with a direct server URL


            const retryResponse = await fetch(`${SERVER_URL}/videos/${videoId}.mp4?t=${Date.now()}`, {
              method: 'GET',
              cache: 'no-cache'
            });

            if (retryResponse.ok) {

              const retryBlob = await retryResponse.blob();


              // Final check on the blob size
              if (retryBlob.size < 100 * 1024) { // Less than 100KB
                throw new Error(`Downloaded blob is too small (${retryBlob.size} bytes), likely not a valid video`);
              }

              const file = new File([retryBlob], `${videoId}.mp4`, { type: 'video/mp4' });

              return file;
            } else {
              throw new Error(`Error fetching video file on retry: ${retryResponse.status} ${retryResponse.statusText}`);
            }
          }

          const file = new File([blob], `${videoId}.mp4`, { type: 'video/mp4' });

          return file;
        } else {
          console.error(`Error fetching video file: ${response.status} ${response.statusText}`);
          throw new Error(`Error fetching video file: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.error('Error creating File object:', error);
        throw error;
      }
    }

    // If not, start the download
    downloadQueue[videoId].status = 'downloading';
    downloadQueue[videoId].progress = 10;



    // Request server to download the video
    const downloadResponse = await fetch(`${SERVER_URL}/api/download-generic-video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoId,
        url,
        forceRefresh: downloadQueue[videoId].forceRefresh
      }),
    });

    if (!downloadResponse.ok) {
      const errorData = await downloadResponse.json();
      throw new Error(errorData.error || 'Failed to download video');
    }

    const downloadData = await downloadResponse.json();

    if (!downloadData.success) {
      throw new Error(downloadData.error || 'Failed to download video');
    }

    // Set up progress reporting
    activeDownloadIntervals[videoId] = setInterval(async () => {
      // Try to get real progress from server first
      try {
        const progressResponse = await fetch(`${SERVER_URL}/api/generic-download-progress/${videoId}`);
        if (progressResponse.ok) {
          const progressData = await progressResponse.json();
          if (progressData.success) {
            // Update local progress with server progress
            downloadQueue[videoId].progress = progressData.progress;
            onProgress(progressData.progress);

            // If progress is 95% or more, check if the file exists
            if (progressData.progress >= 95) {
              isVideoAlreadyDownloaded(videoId).then(exists => {
                if (exists) {
                  // File exists, mark as completed
                  clearInterval(activeDownloadIntervals[videoId]);
                  delete activeDownloadIntervals[videoId];

                  downloadQueue[videoId].status = 'completed';
                  downloadQueue[videoId].progress = 100;
                  onProgress(100);

              // Resolve any pending promises with a File object
              if (downloadQueue[videoId].resolve) {
                // Create a File object for the downloaded video
                fetch(`/videos/${videoId}.mp4`)
                  .then(response => {
                    if (response.ok) {
                      return response.blob();
                    } else {
                      throw new Error(`Error fetching video file: ${response.status} ${response.statusText}`);
                    }
                  })
                  .then(blob => {
                    const file = new File([blob], `${videoId}.mp4`, { type: 'video/mp4' });
                    downloadQueue[videoId].resolve(file);
                  })
                  .catch(error => {
                    console.error('Error creating File object:', error);
                    downloadQueue[videoId].reject(error);
                  });
              }
            }
          });
        }
            return; // Exit early if we got real progress
          } else {
            // Fallback to local progress checking
            console.warn('Server progress not available, falling back to local progress');
          }
        } else {
          // Fallback to local progress checking
          console.warn('Error fetching server progress, falling back to local progress');
        }
      } catch (error) {
        console.warn('Error fetching server progress:', error);
        // Fallback to local progress checking
      }

      // Fallback: use local progress checking
      checkDownloadProgress(videoId).then(progress => {
        onProgress(progress);

        // If progress is 95%, check if the file exists
        if (progress >= 95) {
          isVideoAlreadyDownloaded(videoId).then(exists => {
            if (exists) {
              // File exists, mark as completed
              clearInterval(activeDownloadIntervals[videoId]);
              delete activeDownloadIntervals[videoId];

              downloadQueue[videoId].status = 'completed';
              downloadQueue[videoId].progress = 100;
              onProgress(100);

              // Resolve any pending promises with a File object
              if (downloadQueue[videoId].resolve) {
                // Create a File object for the downloaded video
                fetch(`/videos/${videoId}.mp4`)
                  .then(response => {
                    if (response.ok) {
                      return response.blob();
                    } else {
                      throw new Error(`Error fetching video file: ${response.status} ${response.statusText}`);
                    }
                  })
                  .then(blob => {
                    const file = new File([blob], `${videoId}.mp4`, { type: 'video/mp4' });
                    downloadQueue[videoId].resolve(file);
                  })
                  .catch(error => {
                    console.error('Error creating File object:', error);
                    downloadQueue[videoId].reject(error);
                  });
              }
            }
          });
        }
      });
    }, 1000);

    // Wait for the download to complete
    return new Promise((resolve, reject) => {
      downloadQueue[videoId].resolve = resolve;
      downloadQueue[videoId].reject = reject;

      // Check immediately if the file exists
      isVideoAlreadyDownloaded(videoId).then(exists => {
        if (exists) {
          // File exists, mark as completed
          clearInterval(activeDownloadIntervals[videoId]);
          delete activeDownloadIntervals[videoId];

          downloadQueue[videoId].status = 'completed';
          downloadQueue[videoId].progress = 100;
          onProgress(100);

          // Create a File object for the downloaded video
          // Use a direct URL to the server to avoid any caching issues
          fetch(`${SERVER_URL}/videos/${videoId}.mp4?t=${Date.now()}`, {
            method: 'GET',
            cache: 'no-cache' // Ensure we don't get a cached response
          })
            .then(response => {
              if (response.ok) {

                return response.blob();
              } else {
                throw new Error(`Error fetching video file: ${response.status} ${response.statusText}`);
              }
            })
            .then(blob => {


              // Check if the blob has a reasonable size
              if (blob.size < 100 * 1024) { // Less than 100KB
                console.error(`Downloaded blob is too small (${blob.size} bytes), likely not a valid video`);

                // Try one more time with a direct server URL


                return fetch(`${SERVER_URL}/videos/${videoId}.mp4?t=${Date.now()}`, {
                  method: 'GET',
                  cache: 'no-cache'
                }).then(retryResponse => {
                  if (retryResponse.ok) {

                    return retryResponse.blob();
                  } else {
                    throw new Error(`Error fetching video file on retry: ${retryResponse.status} ${retryResponse.statusText}`);
                  }
                });
              }

              return blob;
            })
            .then(blob => {
              // Final check on the blob size
              if (blob.size < 100 * 1024) { // Less than 100KB
                throw new Error(`Downloaded blob is too small (${blob.size} bytes), likely not a valid video`);
              }

              const file = new File([blob], `${videoId}.mp4`, { type: 'video/mp4' });

              resolve(file);
            })
            .catch(error => {
              console.error('Error creating File object:', error);
              reject(error);
            });
        }
      });
    });
  } catch (error) {
    console.error('Error downloading video:', error);

    // Clean up
    if (activeDownloadIntervals[videoId]) {
      clearInterval(activeDownloadIntervals[videoId]);
      delete activeDownloadIntervals[videoId];
    }

    downloadQueue[videoId].status = 'error';
    downloadQueue[videoId].error = error.message;

    // Reject any pending promises
    if (downloadQueue[videoId].reject) {
      downloadQueue[videoId].reject(error);
    }

    throw error;
  }
};

export const cancelGenericVideoDownload = cancelDownload;
