import crypto from 'node:crypto';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY || '';
const CONFIGURED_MODEL = process.env.SCHEDULE_VISION_MODEL || 'gpt-6.1-terra';
const MAX_IMAGE_BYTES = 3_800_000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const requestTimes = new Map();

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['date', 'rows', 'documentWarnings'],
  properties: {
    date: { type: 'string', description: 'YYYY-MM-DD or empty string' },
    documentWarnings: { type: 'array', items: { type: 'string' } },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'rowIndex', 'startTime', 'endTime', 'customerName', 'serviceType',
          'staffNames', 'staffSegments', 'memo', 'confidence', 'warnings'
        ],
        properties: {
          rowIndex: { type: 'integer', minimum: 1 },
          startTime: { type: 'string', description: 'HH:MM in 24-hour format' },
          endTime: { type: 'string', description: 'HH:MM in 24-hour format' },
          customerName: { type: 'string' },
          serviceType: { type: 'string', enum: ['hair', 'makeup', 'both'] },
          staffNames: { type: 'array', items: { type: 'string' } },
          staffSegments: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['staffName', 'startTime', 'endTime', 'serviceCode'],
              properties: {
                staffName: { type: 'string' },
                startTime: { type: 'string' },
                endTime: { type: 'string' },
                serviceCode: { type: 'string', enum: ['H', 'M', 'WAIT', ''] }
              }
            }
          },
          memo: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          warnings: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }
};

function send(res, status, body) {
  res.status(status).json(body);
}

function resolveAiAuth(req) {
  const oidcToken = String(req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN || '').trim();
  const gatewayToken = AI_GATEWAY_API_KEY || oidcToken;
  const useGateway = !OPENAI_API_KEY && Boolean(gatewayToken);
  return {
    token: OPENAI_API_KEY || gatewayToken,
    useGateway,
    model: useGateway && !CONFIGURED_MODEL.includes('/')
      ? `openai/${CONFIGURED_MODEL}`
      : CONFIGURED_MODEL,
    auth: OPENAI_API_KEY ? 'openai' : gatewayToken ? (AI_GATEWAY_API_KEY ? 'ai_gateway_key' : 'vercel_oidc') : null,
  };
}

function sameOrigin(req) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return true;
  const host = String(req.headers.host || '').trim();
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function rateLimited(req) {
  const key = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const previous = requestTimes.get(key) || 0;
  requestTimes.set(key, now);
  if (requestTimes.size > 500) {
    for (const [ip, at] of requestTimes) if (now - at > 10 * 60 * 1000) requestTimes.delete(ip);
  }
  return now - previous < 8_000;
}

function parseImageData(value) {
  const match = String(value || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !ALLOWED_MIME.has(match[1])) return null;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
  return { mime: match[1], bytes, dataUrl: value };
}

function outputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output || []) {
    for (const part of item?.content || []) {
      if (typeof part?.text === 'string') return part.text;
    }
  }
  return '';
}

function cleanTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function normalizeResult(raw) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw?.date || '')) ? raw.date : '';
  const rows = (Array.isArray(raw?.rows) ? raw.rows : []).map((row, index) => ({
    rowIndex: Number.isInteger(row?.rowIndex) ? row.rowIndex : index + 1,
    startTime: cleanTime(row?.startTime),
    endTime: cleanTime(row?.endTime),
    customerName: String(row?.customerName || '').trim().slice(0, 80),
    serviceType: ['hair', 'makeup', 'both'].includes(row?.serviceType) ? row.serviceType : 'hair',
    staffNames: [...new Set((Array.isArray(row?.staffNames) ? row.staffNames : []).map(v => String(v || '').trim()).filter(Boolean))].slice(0, 5),
    staffSegments: (Array.isArray(row?.staffSegments) ? row.staffSegments : []).map(segment => ({
      staffName: String(segment?.staffName || '').trim(),
      startTime: cleanTime(segment?.startTime),
      endTime: cleanTime(segment?.endTime),
      serviceCode: ['H', 'M', 'WAIT', ''].includes(segment?.serviceCode) ? segment.serviceCode : ''
    })).filter(segment => segment.staffName && segment.startTime && segment.endTime).slice(0, 5),
    memo: String(row?.memo || '').trim().slice(0, 500),
    confidence: Math.max(0, Math.min(1, Number(row?.confidence) || 0)),
    warnings: (Array.isArray(row?.warnings) ? row.warnings : []).map(v => String(v || '').trim()).filter(Boolean).slice(0, 8)
  })).filter(row => row.customerName || row.startTime || row.endTime)
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.rowIndex - b.rowIndex);

  return {
    date,
    rows,
    documentWarnings: (Array.isArray(raw?.documentWarnings) ? raw.documentWarnings : [])
      .map(v => String(v || '').trim()).filter(Boolean).slice(0, 12)
  };
}

function prompt(staffNames) {
  const names = [...new Set(['지현', '보니', '하은', ...(staffNames || [])].map(v => String(v || '').trim()).filter(Boolean))];
  return `You are reading a photographed Korean salon daily schedule sheet titled "누누아누 일일 스케줄표".
Return only data matching the supplied JSON schema.

Extraction rules:
1. Read the document date at the upper right and output YYYY-MM-DD.
2. Each non-empty row in the upper table is one independent appointment. Do not merge rows merely because customer names are identical. Keep chronological order.
3. Read start and end times from the 시간 column. Convert to 24-hour HH:MM. Use row order and the lower staff schedule notes to infer afternoon times; 1:00 after 12:30 means 13:00.
4. Read the customer name from 성명. Ignore 구분, 기본가, 실결제가, and all payment method columns.
5. Interpret H as hair, M as makeup, and both H+M as both. Infer serviceType from the M/H columns, circles, highlights, 순서, and lower notes.
6. Staff aliases: 지=지현, 보=보니, 하=하은. Prefer the exact staff names from this list: ${names.join(', ')}.
7. The lower 메모 area often contains staff-by-staff timelines. Use it to build ordered staffSegments when readable. Each segment must stay within the appointment interval. If exact segment time is uncertain, leave staffSegments empty and keep staffNames in probable order.
8. Ignore crossed-out obsolete text when a replacement is clearly written. If uncertain, keep the most likely value and add a Korean warning.
9. Put only operational remarks from 비고 into memo. Never include prices or payment information.
10. confidence is 0 to 1 for the whole row. Add Korean warnings for unclear handwriting, ambiguous times, staff, or service.
11. Never invent missing customer names, times, or staff. Empty values and warnings are better than guessing.`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const aiAuth = resolveAiAuth(req);
  if (req.method === 'GET') {
    return send(res, 200, {
      configured: Boolean(aiAuth.token),
      model: aiAuth.token ? aiAuth.model : null,
      auth: aiAuth.auth
    });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (!sameOrigin(req)) return send(res, 403, { error: '허용되지 않은 요청입니다.' });
  if (rateLimited(req)) return send(res, 429, { error: '잠시 후 다시 분석해주세요.' });
  if (!aiAuth.token) return send(res, 503, { error: '사진 분석 서버 설정이 완료되지 않았습니다.', code: 'VISION_NOT_CONFIGURED' });

  const image = parseImageData(req.body?.imageData);
  if (!image) return send(res, 400, { error: '지원되지 않는 이미지이거나 파일이 너무 큽니다.' });

  try {
    const response = await fetch(aiAuth.useGateway ? 'https://ai-gateway.vercel.sh/v1/responses' : 'https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aiAuth.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiAuth.model,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: prompt(req.body?.staffNames) },
            { type: 'input_image', image_url: image.dataUrl, detail: 'high' }
          ]
        }],
        text: {
          format: {
            type: 'json_schema',
            name: 'nunuanu_daily_schedule',
            strict: true,
            schema: OUTPUT_SCHEMA
          }
        }
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('[schedule-image-parse] OpenAI error', response.status, payload?.error?.code || payload?.error?.type || 'unknown');
      return send(res, 502, { error: '문서 분석 서비스 호출에 실패했습니다.', detail: payload?.error?.message || '' });
    }

    const text = outputText(payload);
    if (!text) return send(res, 502, { error: '문서 분석 결과가 비어 있습니다.' });
    const parsed = normalizeResult(JSON.parse(text));
    const sourceHash = crypto.createHash('sha256').update(image.bytes).digest('hex').slice(0, 24);
    return send(res, 200, { ...parsed, sourceHash });
  } catch (error) {
    console.error('[schedule-image-parse]', error);
    return send(res, 500, { error: '이미지 문서 분석 중 오류가 발생했습니다.' });
  }
}

