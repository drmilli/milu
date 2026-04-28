#!/usr/bin/env bash
# Local test for Africa's Talking voice webhook
# Usage: ./test-at-voice.sh [BASE_URL] [DEST_NUMBER] [CALLER]

BASE_URL="${1:-http://localhost:4000}"
DEST="${2:-+2342017001479}"
CALLER="${3:-+2349000000001}"
SESSION="ATVId_test_$(date +%s)"

echo ""
echo "=== AT Voice Test ==="
echo "API: $BASE_URL"
echo "Dest: $DEST  Caller: $CALLER"
echo "Session: $SESSION"
echo ""

# ── Step 1: Inbound call (isActive=1, no recording) ────────────────────────
echo "--- Step 1: New inbound call ---"
STEP1=$(curl -s -X POST "$BASE_URL/webhooks/at/voice" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "sessionId=$SESSION&callerNumber=$CALLER&destinationNumber=$DEST&isActive=1&direction=Inbound&callSessionState=Active&callerCountryCode=NG")
echo "$STEP1"
echo ""

if echo "$STEP1" | grep -q "<Say>"; then
  echo "✓ Got greeting response"
else
  echo "ERROR: No greeting in response. Is the API running and number registered?"
  exit 1
fi

echo "Waiting 4s (simulating greeting playback)..."
sleep 4

# ── Step 2: Recording callback (caller spoke) ──────────────────────────────
echo "--- Step 2: Caller spoke (recording callback) ---"
RECORDING_URL="https://www2.cs.uic.edu/~i101/SoundFiles/gettysburg10.wav"

STEP2=$(curl -s -X POST "$BASE_URL/webhooks/at/voice" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "sessionId=$SESSION" \
  --data-urlencode "callerNumber=$CALLER" \
  --data-urlencode "destinationNumber=$DEST" \
  -d "isActive=1&direction=Inbound&callSessionState=Active&callerCountryCode=NG&durationInSeconds=3" \
  --data-urlencode "recordingUrl=$RECORDING_URL")
echo "$STEP2"
echo ""

if echo "$STEP2" | grep -q "Please hold"; then
  echo "✓ Got hold response — AI is processing in background"
elif echo "$STEP2" | grep -q "<Say>"; then
  echo "✓ Got immediate response"
else
  echo "WARNING: Unexpected response"
fi

# ── Step 3: Hold callback (2s later, AI should be done) ───────────────────
echo ""
echo "--- Step 3: Hold callback (waiting 5s for AI to finish) ---"
sleep 5

STEP3=$(curl -s -X POST "$BASE_URL/webhooks/at/voice/hold" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "sessionId=$SESSION&callerNumber=$CALLER&destinationNumber=$DEST&isActive=1&direction=Inbound&callSessionState=Active&callerCountryCode=NG")
echo "$STEP3"
echo ""

if echo "$STEP3" | grep -q "<Say>"; then
  echo "✓ Got AI response!"
elif echo "$STEP3" | grep -q "<Record"; then
  echo "⚠ AI still processing, hold extended — try another hold callback"
  sleep 3
  STEP3B=$(curl -s -X POST "$BASE_URL/webhooks/at/voice/hold" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "sessionId=$SESSION&callerNumber=$CALLER&destinationNumber=$DEST&isActive=1&direction=Inbound&callSessionState=Active&callerCountryCode=NG")
  echo "$STEP3B"
  if echo "$STEP3B" | grep -q "<Say>"; then
    echo "✓ Got AI response on second hold!"
  fi
else
  echo "ERROR: No response"
fi

# ── Step 4: Call end ────────────────────────────────────────────────────────
echo ""
echo "--- Step 4: Call end ---"
sleep 1
curl -s -X POST "$BASE_URL/webhooks/at/voice" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "sessionId=$SESSION&callerNumber=$CALLER&destinationNumber=$DEST&isActive=0&direction=Inbound&callSessionState=Completed&callerCountryCode=NG&durationInSeconds=30&status=Success"
echo ""
echo "=== Done. Check your API logs. ==="
