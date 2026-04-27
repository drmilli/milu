#!/usr/bin/env bash
# Local test for Africa's Talking voice webhook
# Usage: ./test-at-voice.sh [BASE_URL] [DEST_NUMBER] [CALLER]
#
# Requires the API running locally: pnpm dev (in apps/api)
# For production webhook testing: set BASE_URL to your ngrok URL

BASE_URL="${1:-http://localhost:4000}"
DEST="${2:-+2342017001479}"   # Your AT number
CALLER="${3:-+2349000000001}"  # Simulated caller
SESSION="ATVId_test_$(date +%s)"

echo ""
echo "=== AT Voice Local Test ==="
echo "API: $BASE_URL"
echo "Dest: $DEST  Caller: $CALLER"
echo ""

# ── Step 1: Inbound call (isActive=1) ──────────────────────────────────────
echo "--- Step 1: Inbound call ---"
STEP1=$(curl -s -X POST "$BASE_URL/webhooks/at/voice" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "sessionId=$SESSION&callerNumber=$CALLER&destinationNumber=$DEST&isActive=1&direction=Inbound&callSessionState=Active&callerCountryCode=NG")
echo "$STEP1"
echo ""

# Extract callId from the callbackUrl in the response XML
CALL_ID=$(echo "$STEP1" | grep -oP 'callId=\K[^"&<]+' | head -1)
echo "→ Extracted callId: $CALL_ID"
echo ""

if [ -z "$CALL_ID" ]; then
  echo "ERROR: Could not extract callId from response. Is the API running and the phone number in the DB?"
  exit 1
fi

# Wait for greeting to finish (simulate real-time)
echo "Waiting 4 seconds (simulating greeting playback)..."
sleep 4

# ── Step 2: Recording callback (isActive=1, caller still on line) ───────────
echo "--- Step 2: Recording callback (caller spoke) ---"
# Use a publicly accessible test audio file — a short English phrase
# You can replace this with any public .mp3 URL
RECORDING_URL="https://www2.cs.uic.edu/~i101/SoundFiles/gettysburg10.wav"

STEP2=$(curl -s -X POST "$BASE_URL/webhooks/at/voice?callId=$CALL_ID" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "sessionId=$SESSION&callerNumber=$CALLER&destinationNumber=$DEST&isActive=1&direction=Inbound&callSessionState=Active&callerCountryCode=NG&recordingUrl=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$RECORDING_URL'))")&durationInSeconds=3")
echo "$STEP2"
echo ""

# ── Step 3: Call end ────────────────────────────────────────────────────────
echo "--- Step 3: Call end ---"
sleep 2
curl -s -X POST "$BASE_URL/webhooks/at/voice" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "sessionId=$SESSION&callerNumber=$CALLER&destinationNumber=$DEST&isActive=0&direction=Inbound&callSessionState=Completed&callerCountryCode=NG&durationInSeconds=10&status=Success"
echo ""
echo "=== Done. Check your API logs. ==="
