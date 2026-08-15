# 🚀 Deployment Checklist - Audio Recording & Verification System

## Pre-Deployment Verification ✅

### Mobile Client
```bash
# ✅ TypeScript compilation
cd mobile && npx tsc --noEmit
# Exit code: 0 (PASS)

# ✅ All imports resolved
# ✅ Type safety validated
# ✅ Error handling in place
# ✅ Speech recognition integrated
# ✅ Verification API client ready
```

### Server
```bash
# ✅ JavaScript syntax validation
cd server && node -c src/index.js
# Exit code: 0 (PASS)

# ✅ Endpoint implemented
# ✅ Error handling implemented
# ✅ Authentication required
# ✅ Feature flag integrated
```

---

## Deployment Checklist

### Step 1: Server Deployment ⚙️

- [ ] Merge `server/src/index.js` changes
  - Added: `/api/ai/verify-transcription` endpoint (~110 lines)
  - Location: After `/api/ai/transcribe` endpoint
  - Requires: `OPENAI_API_KEY`, Supabase connection

- [ ] Verify environment variables
  ```bash
  # Required on production server:
  OPENAI_API_KEY=sk-...
  SUPABASE_URL=https://...
  SUPABASE_SERVICE_ROLE_KEY=...
  DATABASE_URL=postgresql://...
  ```

- [ ] Verify feature flag exists
  - Check admin dashboard for `sermon_transcription` flag
  - Current status: Should be enabled

- [ ] Test endpoint locally
  ```bash
  # Terminal 1: Start server
  npm run dev
  
  # Terminal 2: Test verification
  curl -X POST http://localhost:3000/api/ai/verify-transcription \
    -H "Authorization: Bearer <test_token>" \
    -F "audio=@test_sermon.m4a" \
    -F "transcribedText=The faith was strong today"
  ```

- [ ] Expected response
  ```json
  {
    "isAccurate": false,
    "corrections": [
      { "original": "faith", "corrected": "fate", "confidence": 0.95 }
    ],
    "verifiedText": "The fate was strong today"
  }
  ```

### Step 2: Mobile Deployment 📱

- [ ] Merge mobile client changes
  - Modified: `mobile/src/lib/api.ts` (new `verifyAndCorrectTranscription()`)
  - Modified: `mobile/src/lib/sermonRecorder.ts` (background verification)
  - Modified: `mobile/src/screens/bible/NotesScreen.tsx` (voice input)
  - Modified: `mobile/src/screens/bible/ChapterReaderScreen.tsx` (verse voice input)

- [ ] Verify TypeScript compilation
  ```bash
  cd mobile && npx tsc --noEmit
  # Should exit with code 0
  ```

- [ ] Build and test locally
  ```bash
  expo prebuild
  npx expo run:ios  # or run:android
  ```

- [ ] Test features
  - [ ] Voice input in general notes
  - [ ] Voice input in verse notes
  - [ ] Real-time interim text preview
  - [ ] Auto-retry on recognition errors
  - [ ] Text formatting before save
  - [ ] Sermon recording completion
  - [ ] Background verification status update

- [ ] Push to app store
  - Build: `eas build --platform ios`
  - Deploy: `eas submit --platform ios`
  - Repeat for Android

### Step 3: Admin Configuration 🔧

- [ ] Enable `sermon_transcription` feature flag
  1. Open admin dashboard
  2. Navigate to Feature Flags
  3. Find `sermon_transcription`
  4. Set status to: **Enabled**
  5. Save changes

- [ ] Verify flag is active
  ```bash
  # Test endpoint returns 503 when flag is disabled
  # Should work when flag is enabled
  ```

### Step 4: Monitoring Setup 📊

- [ ] Set up logging for verification endpoint
  ```bash
  # Monitor logs for:
  # - "verify-transcription error:"
  # - "Failed to parse correction comparison:"
  # - Timeout errors
  # - OpenAI API errors
  ```

- [ ] Set up metrics tracking
  - Track API call count
  - Track success/error rates
  - Track average response time
  - Track correction accuracy

- [ ] Set up alerts
  - Alert if verification error rate > 5%
  - Alert if average response time > 100s
  - Alert if OpenAI API quota exceeded

### Step 5: Cost Management 💰

- [ ] Monitor OpenAI API usage
  - Whisper: ~$0.006 per minute of audio
  - GPT-4o-mini: ~$0.0001 per verification
  - Estimate: ~$0.06-0.07 per 10-minute sermon

- [ ] Set up API usage alerts
  - Alert when daily usage exceeds threshold
  - Consider implementing per-user daily limits if needed

---

## Testing Plan 🧪

### Unit Tests
- [ ] Verification endpoint returns correct response format
- [ ] Confidence filtering works (< 0.7 filtered out)
- [ ] Graceful fallback on error
- [ ] Timeout handling (180s)

### Integration Tests
- [ ] End-to-end sermon recording → transcription → verification
- [ ] Error recovery on network failure
- [ ] Feature flag disable returns 503
- [ ] Authentication required (401 without token)

### User Acceptance Tests
- [ ] Record 5-minute sermon → transcription → verification
- [ ] Record 10-minute sermon → transcription → verification
- [ ] Record verse note with voice → auto-save
- [ ] Verify corrections are applied
- [ ] Verify UI shows verification status

### Performance Tests
- [ ] Verify response time < 100s for typical sermon
- [ ] Verify concurrent requests don't block each other
- [ ] Verify memory usage stays under 500MB
- [ ] Verify no memory leaks on long-running app

---

## Rollback Plan 🔄

If verification endpoint causes issues:

### Option 1: Disable Feature Flag (Immediate)
```bash
# Disable via admin dashboard
# All verification calls will be skipped
# Mobile app continues to work with original text
```

### Option 2: Revert Code Changes
```bash
git revert <commit_hash>
# Server: Remove `/api/ai/verify-transcription` endpoint
# Mobile: No changes needed (gracefully falls back)
```

### Option 3: Disable via Environment Variable
```bash
# Add feature flag check to decide whether to call verification
ENABLE_VERIFICATION=false
```

**Important:** Mobile app has graceful fallback, so verification endpoint failure doesn't break recording functionality.

---

## Post-Deployment Validation ✅

### Day 1
- [ ] Monitor error logs for verification endpoint
- [ ] Verify at least 10 successful verifications
- [ ] Check for any timeout errors
- [ ] Monitor OpenAI API usage
- [ ] Gather initial user feedback

### Week 1
- [ ] Analyze correction accuracy
- [ ] Identify common false corrections
- [ ] Check if confidence threshold (0.7) is appropriate
- [ ] Monitor success rate (target: >98%)
- [ ] Review user feedback

### Month 1
- [ ] Generate usage statistics
- [ ] Calculate cost per verification
- [ ] Identify edge cases
- [ ] Optimize based on user feedback
- [ ] Consider language expansion

---

## Known Limitations ⚠️

1. **English Only** - GPT comparison optimized for English
   - Fix: Update system prompt for other languages

2. **Confidence Threshold** - Currently 0.7 (70%)
   - Adjust via: Change `c.confidence >= 0.7` to desired value

3. **Processing Time** - 20-100 seconds depending on audio length
   - Expected for: Whisper re-transcription + GPT analysis
   - User Impact: Runs in background, doesn't block app

4. **Cost** - ~$0.06-0.07 per 10-minute sermon
   - Optimization: Could batch process or use cheaper models

5. **Regional Accents** - May have lower accuracy for non-standard accents
   - Improve: Fine-tune GPT prompts or use accent-specific models

---

## Support & Troubleshooting 🆘

### Common Issues

**"Feature currently disabled" (503)**
→ Enable `sermon_transcription` flag in admin dashboard

**"Verification failed, using original transcription"**
→ Check OpenAI API key, check server logs, verify network connectivity

**Timeout after 180 seconds**
→ Audio file too long (>30 min), split into multiple files

**No corrections returned**
→ Transcriptions are identical, original is accurate

**Too many false corrections**
→ Lower confidence threshold (change 0.7 to 0.8)

**Correction accuracy seems low**
→ Review GPT system prompt, consider adding examples

---

## Success Criteria ✨

Deployment is successful when:

- ✅ Endpoint responds to requests (200 OK)
- ✅ Verification returns correct response format
- ✅ Corrections are high-confidence and accurate
- ✅ Graceful fallback works on error
- ✅ Mobile app displays verification status
- ✅ No increase in error logs
- ✅ User feedback is positive
- ✅ Cost is within budget

---

## Files to Deploy

### Server Changes
- `server/src/index.js` - Added `/api/ai/verify-transcription` endpoint

### Mobile Changes
- `mobile/src/lib/api.ts` - Verification API client
- `mobile/src/lib/sermonRecorder.ts` - Background verification
- `mobile/src/screens/bible/NotesScreen.tsx` - Voice input
- `mobile/src/screens/bible/ChapterReaderScreen.tsx` - Verse voice input

### Documentation (For Reference)
- `RECORDING_FEATURES_UPDATE.md` - Feature documentation
- `SERVER_VERIFICATION_ENDPOINT_DOCS.md` - API reference
- `IMPLEMENTATION_COMPLETE.md` - Implementation summary
- `DEPLOYMENT_CHECKLIST.md` - This file

---

## Sign-Off

- [ ] Tech Lead: Reviewed and approved deployment
- [ ] QA: All tests passed
- [ ] Operations: Infrastructure verified
- [ ] Admin: Feature flag enabled
- [ ] Product: User acceptance testing passed

---

## Contact & Questions

For questions about implementation:
- Review: `SERVER_VERIFICATION_ENDPOINT_DOCS.md`
- Review: `RECORDING_FEATURES_UPDATE.md`
- Review: Code comments in `server/src/index.js`

---

**Last Updated:** 2026-08-14  
**Status:** ✅ Ready for Deployment  
**Risk Level:** Low (graceful fallback implemented)  
**Estimated Deployment Time:** 30-60 minutes
