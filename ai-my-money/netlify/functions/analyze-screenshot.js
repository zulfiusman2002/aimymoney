import { handler as wrap, requireUser, json, callClaude, parseClaudeJson } from './_lib/core.js';

export const handler = wrap(async (event) => {
  const { user, db } = await requireUser(event);
  const { imageBase64, mediaType = 'image/png', assetType = 'unknown', screenshotId } = JSON.parse(event.body || '{}');
  if (!imageBase64) return json(400, { error: 'imageBase64 required' });

  const raw = await callClaude({
    maxTokens: 3000,
    system: `You extract investment data from portfolio screenshots. Return ONLY valid JSON, no markdown, exactly:
{
 "asset_type": "", "platform": "", "currency": "", "snapshot_date": "YYYY-MM-DD or null",
 "holdings": [{"asset_name":"","ticker":null,"quantity":null,"current_value":0,"invested_value":null,"gain_loss":null,"confidence_score":0.0}],
 "total_value": 0, "warnings": [], "extraction_confidence": 0.0
}
Rules: never invent values — use null for anything not visible. Only report analyst ratings/consensus if they are literally visible in the screenshot; never infer them. confidence_score and extraction_confidence are 0–1.
If the image is not a financial screenshot, return holdings: [] with a warning explaining why.
The user says this is asset type: "${assetType}".`,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        { type: 'text', text: 'Extract all holdings and values from this screenshot.' },
      ],
    }],
  });

  const extraction = parseClaudeJson(raw);

  if (screenshotId) {
    await db.from('uploaded_screenshots')
      .update({ processed_status: 'processed', claude_response: extraction, extraction_confidence: extraction.extraction_confidence })
      .eq('id', screenshotId).eq('user_id', user.id);
  }

  return json(200, extraction);
});
