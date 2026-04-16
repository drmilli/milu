export function buildSayResponse(text: string, voice = 'woman'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}">${escapeXml(text)}</Say>
</Response>`;
}

export function buildTransferResponse(toNumber: string, callId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial record="true" callId="${callId}">
    <Number>${toNumber}</Number>
  </Dial>
</Response>`;
}

export function buildStreamResponse(wsUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" />
  </Connect>
</Response>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
