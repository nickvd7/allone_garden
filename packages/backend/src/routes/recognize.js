/**
 * Plant recognition routes — AI-powered photo identification.
 *
 * POST /api/recognize/plant
 *   Accepts a base64-encoded image and a user-supplied API key.
 *   Calls the chosen provider's vision API and returns the best matching
 *   in-game plant slug.
 *
 * API keys are NEVER stored on the server — they are passed per-request,
 * used once, and discarded. They are never logged.
 *
 * Supported providers: openai | anthropic | gemini
 */
const express = require('express');
const router  = express.Router();
const fetch   = require('node-fetch');
const { recognitionLimiter } = require('../middleware/security');

// Known in-game plant slugs — recognition result is mapped to one of these
const KNOWN_SLUGS = [
  'tomato','carrot','lettuce','radish','corn','potato',
  'pumpkin','sunflower','blueberry','wheat','pepper',
  'cucumber','zucchini','strawberry','lavender','mint','basil',
];

// ── Provider adapters ─────────────────────────────────────────────────────────

async function recogniseWithOpenAI(base64Image, mimeType, apiKey) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'low' },
          },
          {
            type: 'text',
            text: buildPrompt(),
          },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI error ${res.status}`);
  }

  const data = await res.json();
  return parseJsonResponse(data.choices?.[0]?.message?.content || '');
}

async function recogniseWithAnthropic(base64Image, mimeType, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'x-api-key':     apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          {
            type:   'image',
            source: { type: 'base64', media_type: mimeType, data: base64Image },
          },
          { type: 'text', text: buildPrompt() },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic error ${res.status}`);
  }

  const data = await res.json();
  return parseJsonResponse(data.content?.[0]?.text || '');
}

async function recogniseWithGemini(base64Image, mimeType, apiKey) {
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: buildPrompt() },
        ],
      }],
      generationConfig: { maxOutputTokens: 200 },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini error ${res.status}`);
  }

  const data = await res.json();
  return parseJsonResponse(data.candidates?.[0]?.content?.parts?.[0]?.text || '');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPrompt() {
  return (
    `You are a plant identification assistant for a gardening game. ` +
    `Identify the plant in this image and return a JSON object (no markdown, only valid JSON) with:\n` +
    `- "plant": the common name of the plant (e.g. "Tomato")\n` +
    `- "slug": the best matching slug from this list: ${KNOWN_SLUGS.join(', ')} — or null if none match\n` +
    `- "confidence": a number 0-100\n` +
    `- "description": one short sentence describing what you see\n` +
    `Example: {"plant":"Tomato","slug":"tomato","confidence":92,"description":"Red ripe tomatoes on a vine."}`
  );
}

function parseJsonResponse(text) {
  // Strip markdown fences if any
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  const stripPollution = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const out = {};
    for (const k of Object.keys(obj)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      out[k] = obj[k];
    }
    return out;
  };
  try {
    return stripPollution(JSON.parse(clean));
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return stripPollution(JSON.parse(match[0]));
    throw new Error('Could not parse AI response as JSON');
  }
}

// ── POST /api/recognize/plant ─────────────────────────────────────────────────
router.post('/plant', recognitionLimiter, async (req, res) => {
  const { image, mimeType = 'image/jpeg', provider = 'openai', apiKey } = req.body;

  if (!image)  return res.status(400).json({ error: 'image (base64) is required' });
  if (!apiKey) return res.status(400).json({ error: 'apiKey is required' });

  const validProviders = ['openai', 'anthropic', 'gemini'];
  if (!validProviders.includes(provider)) {
    return res.status(400).json({ error: `provider must be one of: ${validProviders.join(', ')}` });
  }

  // Validate MIME type
  const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!validMimes.includes(mimeType)) {
    return res.status(400).json({ error: 'mimeType must be image/jpeg, image/png, image/webp, or image/gif' });
  }

  // Basic size guard: 5 MB base64 ≈ 3.75 MB binary
  if (image.length > 7_000_000) {
    return res.status(413).json({ error: 'Image too large — please compress to under 5 MB' });
  }

  try {
    let result;
    if (provider === 'openai')    result = await recogniseWithOpenAI(image, mimeType, apiKey);
    if (provider === 'anthropic') result = await recogniseWithAnthropic(image, mimeType, apiKey);
    if (provider === 'gemini')    result = await recogniseWithGemini(image, mimeType, apiKey);

    // Normalise slug: must be a known game plant or null
    if (result.slug && !KNOWN_SLUGS.includes(result.slug)) {
      result.slug = null;
    }

    return res.json({
      ok:          true,
      plant:       result.plant       || 'Unknown',
      slug:        result.slug        || null,
      confidence:  result.confidence  || 0,
      description: result.description || '',
      provider,
    });
  } catch (err) {
    // Never echo apiKey in error messages
    const message = err.message.replace(apiKey, '[REDACTED]');
    return res.status(502).json({ error: message });
  }
});

module.exports = router;
