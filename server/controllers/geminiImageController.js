/**
 * Controller for Gemini image generation operations
 */
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');
const { GoogleGenAI } = require('@google/genai');

/**
 * Generate a prompt for background image using Gemini
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const generatePrompt = async (req, res) => {
  try {
    const { lyrics, songName } = req.body;

    if (!lyrics) {
      return res.status(400).json({ error: 'Missing lyrics' });
    }

    // Get Gemini API key from localStorage
    let geminiApiKey = null;
    try {
      const localStoragePath = path.join(process.cwd(), 'localStorage.json');
      const localStorageData = await fs.readFile(localStoragePath, 'utf-8');
      const localStorage = JSON.parse(localStorageData);
      geminiApiKey = localStorage.gemini_token || localStorage.gemini_api_key;
    } catch (localStorageError) {
      console.error('Error reading localStorage file:', localStorageError);
    }

    if (!geminiApiKey) {
      return res.status(400).json({ error: 'Gemini API key not set. Please provide it through the settings.' });
    }

    // Use the Google GenAI library with gemini-2.0-flash-lite model


    // Initialize the Google GenAI client
    const genAI = new GoogleGenAI({ apiKey: geminiApiKey });


    // Get the model


    // Prepare the content
    const content = `
song title: ${songName || 'Unknown Song'}

${lyrics}

generate one prompt to put in a image generator to describe the atmosphere/object of this song, should be simple but abstract because I will use this image as youtube video background for a lyrics video, return the prompt only, no extra texts
`;

    // Set generation config
    const generationConfig = {
      temperature: 0.4,
      topK: 32,
      topP: 0.95,
      maxOutputTokens: 8192,
    };

    // Generate the prompt

    const response = await genAI.models.generateContent({
      model: 'gemini-2.0-flash-lite',
      contents: [{ text: content }],
      generationConfig,
    });




    // Extract the prompt from the response

    const prompt = response.candidates[0].content.parts[0].text.trim();

    return res.json({ prompt });
  } catch (error) {
    console.error('Error in generatePrompt:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Generate a background image using Gemini
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const generateImage = async (req, res) => {
  try {
    const { prompt, albumArtUrl } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    if (!albumArtUrl) {
      return res.status(400).json({ error: 'Missing album art URL' });
    }

    // Get Gemini API key from localStorage
    let geminiApiKey = null;
    try {
      const localStoragePath = path.join(process.cwd(), 'localStorage.json');
      const localStorageData = await fs.readFile(localStoragePath, 'utf-8');
      const localStorage = JSON.parse(localStorageData);
      geminiApiKey = localStorage.gemini_token || localStorage.gemini_api_key;
    } catch (localStorageError) {
      console.error('Error reading localStorage file:', localStorageError);
    }

    if (!geminiApiKey) {
      return res.status(400).json({ error: 'Gemini API key not set. Please provide it through the settings.' });
    }

    // Prepare the image data
    let imageData;
    if (albumArtUrl.startsWith('data:')) {
      // Handle base64 encoded image
      const base64Data = albumArtUrl.split(',')[1];
      imageData = Buffer.from(base64Data, 'base64');
    } else if (albumArtUrl.startsWith('http://') || albumArtUrl.startsWith('https://')) {
      // Handle absolute URL
      const response = await fetch(albumArtUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch album art: ${response.statusText}`);
      }
      imageData = await response.buffer();
    } else {
      // Handle relative URL by checking if it's in the public directory
      // First, try to read the file directly from the public directory
      try {
        const publicPath = path.join(process.cwd(), 'public', albumArtUrl.replace(/^\//, ''));

        imageData = await fs.readFile(publicPath);

      } catch (error) {
        // If that fails, try to fetch it as a URL

        const absoluteUrl = `process.env.BACKEND_URL${albumArtUrl.startsWith('/') ? '' : '/'}${albumArtUrl}`;

        try {
          const response = await fetch(absoluteUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch album art: ${response.statusText}`);
          }
          imageData = await response.buffer();
        } catch (fetchError) {

          // Try one more time with /public prefix
          const publicUrl = `process.env.BACKEND_URL/public${albumArtUrl.startsWith('/') ? '' : '/'}${albumArtUrl}`;

          const publicResponse = await fetch(publicUrl);
          if (!publicResponse.ok) {
            throw new Error(`Failed to fetch album art with public prefix: ${publicResponse.statusText}`);
          }
          imageData = await publicResponse.buffer();
        }
      }
    }

    // Convert image to base64
    const base64Image = imageData.toString('base64');

    // Determine the correct MIME type
    let mimeType;
    if (albumArtUrl.startsWith('data:')) {
      // Extract from data URL
      mimeType = albumArtUrl.split(';')[0].split(':')[1];
    } else if (albumArtUrl.toLowerCase().endsWith('.png')) {
      mimeType = 'image/png';
    } else if (albumArtUrl.toLowerCase().endsWith('.jpg') || albumArtUrl.toLowerCase().endsWith('.jpeg')) {
      mimeType = 'image/jpeg';
    } else if (albumArtUrl.toLowerCase().endsWith('.gif')) {
      mimeType = 'image/gif';
    } else if (albumArtUrl.toLowerCase().endsWith('.webp')) {
      mimeType = 'image/webp';
    } else {
      // Try to detect the image type from the buffer
      // Use Buffer.subarray instead of slice to avoid deprecation warning
      const signature = imageData.subarray(0, 4).toString('hex');
      if (signature.startsWith('89504e47')) {
        mimeType = 'image/png';
      } else if (signature.startsWith('ffd8ff')) {
        mimeType = 'image/jpeg';
      } else if (signature.startsWith('47494638')) {
        mimeType = 'image/gif';
      } else if (signature.startsWith('52494646') && imageData.subarray(8, 12).toString('hex') === '57454250') {
        mimeType = 'image/webp';
      } else {
        // Default fallback
        mimeType = 'image/png';
      }
    }



    // Call Gemini API to generate image
    const finalPrompt = `Expand the image into 16:9 ratio (landscape ratio). Then decorate my given image with ${prompt}`;






    // Use the Google GenAI library as shown in the example
    try {
      // Initialize the Google GenAI client
      const genAI = new GoogleGenAI({ apiKey: geminiApiKey });




      // Generate content with the model


      // Follow the new instructions exactly
      const contents = [
        { text: finalPrompt },
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image,
          },
        },
      ];



      // Set both generationConfig and config with responseModalities as shown in the example
      const response = await genAI.models.generateContent({
        model: 'gemini-2.0-flash-preview-image-generation',
        contents: contents,
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
        config: {
          responseModalities: ["TEXT", "IMAGE"]
        }
      });




      // Process the response parts exactly as in the example
      let imageBase64 = null;
      let textResponse = '';
      let imageMimeType = 'image/png';
      let imageSaved = false;




      if (response.candidates && response.candidates.length > 0) {


        for (const part of response.candidates[0].content.parts) {
          // Based on the part type, either store the text or save the image
          if (part.text) {

            textResponse += part.text + '\n';
          } else if (part.inlineData) {

            imageBase64 = part.inlineData.data;
            imageMimeType = part.inlineData.mimeType;

            imageSaved = true;
          } else if (part['inline_data'] && part['inline_data'].data) {

            imageBase64 = part['inline_data'].data;
            imageMimeType = part['inline_data'].mime_type;

            imageSaved = true;
          }
        }
      } else {

        if (response.promptFeedback) {
          console.error('Prompt Feedback:', response.promptFeedback);
        }
      }

      if (!imageSaved) {

        if (textResponse) {

        }
      }

      // If no image was found in the response, throw an error
      if (!imageBase64) {


        throw new Error('No image was generated in the response');
      }

      return res.json({
        data: imageBase64,
        mime_type: imageMimeType,
        text_response: textResponse
      });
    } catch (apiError) {
      console.error('Gemini API error details:', apiError);
      throw new Error(`Gemini API error: ${apiError.message}`);
    }
  } catch (error) {
    console.error('Error in generateImage:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get the current prompts used for image generation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getPrompts = (req, res) => {
  try {
    // Return the current prompts
    res.json({
      promptOne: `song title: \${songName || 'Unknown Song'}

\${lyrics}

generate one prompt to put in a image generator to describe the atmosphere/object of this song, should be simple but abstract because I will use this image as youtube video background for a lyrics video, return the prompt only, no extra texts`,
      promptTwo: `Expand the image into 16:9 ratio (landscape ratio). Then decorate my given image with \${prompt}`
    });
  } catch (error) {
    console.error('Error getting prompts:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  generatePrompt,
  generateImage,
  getPrompts
};
