/**
 * Utility functions for handling video segmentation
 * This allows processing long videos by splitting them into smaller segments
 */

// Server URL for the local server
const SERVER_URL = process.env.BACKEND_URL+''; // Changed from 3004 to match server port

/**
 * Upload a video file to the server and split it into segments
 * @param {File} videoFile - The video file to upload and split
 * @param {number} segmentDuration - Duration of each segment in seconds (default: 600 seconds = 10 minutes)
 * @param {Function} onProgress - Progress callback function
 * @returns {Promise<Object>} - Object containing segment URLs and metadata
 */
export const uploadAndSplitVideo = async (videoFile, segmentDuration = 600, onProgress = () => {}) => {
  try {
    // Use translation key for uploading message
    onProgress(10, 'output.uploadingVideoToServer', 'Uploading video to server...');

    // Create URL with query parameter for segment duration
    const url = `${SERVER_URL}/api/upload-and-split-video?segmentDuration=${segmentDuration}`;

    // Upload the video file
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': videoFile.type,
      },
      body: videoFile, // Send the raw file
      // Add timeout settings to handle large files
      timeout: 300000, // 5 minutes timeout
    });

    if (!response.ok) {
      console.error('Upload failed with status:', response.status);
      let errorMessage = `Failed to upload and split video (Status: ${response.status})`;

      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        console.error('Error parsing error response:', e);
        // Try to get the text response instead
        try {
          const textResponse = await response.text();
          console.error('Error response text:', textResponse);
          errorMessage += ` - Server response: ${textResponse.substring(0, 100)}...`;
        } catch (textError) {
          console.error('Error getting response text:', textError);
        }
      }

      throw new Error(errorMessage);
    }

    // Use translation key for uploaded message
    onProgress(50, 'output.videoUploaded', 'Video uploaded, processing segments...');

    const data = await response.json();


    // Use translation key for segments ready message
    onProgress(100, 'output.videoSegmentsReady', 'Video segments ready');

    return {
      success: true,
      originalVideo: `${SERVER_URL}${data.originalVideo}`,
      batchId: data.batchId,
      segments: data.segments.map(segment => `${SERVER_URL}${segment}`),
      message: data.message
    };
  } catch (error) {
    console.error('Error uploading and splitting video:', error);
    throw error;
  }
};

/**
 * Fetch a video segment from a URL
 * @param {string} segmentUrl - URL of the segment to fetch
 * @returns {Promise<File>} - File object representing the segment
 */
export const fetchVideoSegment = async (segmentUrl) => {
  try {
    const response = await fetch(segmentUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch segment: ${response.statusText}`);
    }

    const blob = await response.blob();
    const filename = segmentUrl.split('/').pop();

    // Create a File object from the blob
    return new File([blob], filename, { type: blob.type });
  } catch (error) {
    console.error('Error fetching video segment:', error);
    throw error;
  }
};
