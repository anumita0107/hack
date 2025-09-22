require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the root directory
app.use(express.static(__dirname));

// API endpoint to analyze journal entries
app.post('/api/analyze', async (req, res) => {
    const { entry } = req.body;

    if (!entry) {
        return res.status(400).json({ error: 'Journal entry is required.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key not configured on the server.' });
    }

    // Using a stable, recent model instead of the preview one from the original file.
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

    const systemPrompt = `You are a helpful AI assistant for a mental wellness journal. Your task is to analyze a user's journal entry and provide two things in a structured JSON format: 1) a sentiment score from -10 (very negative) to 10 (very positive), and 2) a list of at least 3 personalized, actionable suggestions.
    The suggestions should be based on the sentiment and context of the journal entry. They should be brief, friendly, and helpful.
    Each suggestion in the list should have a 'title', 'description', and a 'category' from the following list: ['Meditation', 'Sleep', 'Professional', 'Gratitude', 'Connect', 'General'].

    Example JSON response:
    {
      "sentimentScore": 7,
      "suggestions": [
        { "title": "Practice Gratitude", "description": "You had a good day! Write down three things you are grateful for to reinforce that positive feeling.", "category": "Gratitude" },
        { "title": "Connect with Others", "description": "Sharing your joy can double it! Tell a friend or family member about your day.", "category": "Connect" },
        { "title": "Mindful Moment", "description": "Even on a good day, it's good to pause. Take a moment to notice your breathing.", "category": "Meditation" }
      ]
    }
    `;

    const payload = {
        contents: [{ parts: [{ text: `My journal entry: "${entry}"` }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    "sentimentScore": { "type": "NUMBER" },
                    "suggestions": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "title": { "type": "STRING" },
                                "description": { "type": "STRING" },
                                "category": { "type": "STRING" }
                            }
                        }
                    }
                }
            }
        }
    };

    try {
        const response = await axios.post(apiUrl, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        const jsonString = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonString) {
            // Log the full response from Gemini for debugging
            console.error("Invalid response format from Gemini API. Full response:", JSON.stringify(response.data, null, 2));
            throw new Error("Invalid response format from Gemini API.");
        }
        const parsedJson = JSON.parse(jsonString);
        res.json(parsedJson);

    } catch (error) {
        console.error('Error calling Gemini API:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        res.status(500).json({ error: 'Failed to analyze entry. The API key might be invalid or expired. Please check the server logs.' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
