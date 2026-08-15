# Production Implementation Checklist

## Completed ✅
- [x] Separate reels schema and backend (community_reels, reel_views, reel_likes, reel_comments tables)
- [x] Reels API endpoints (upload, create, like, view, comments)
- [x] Reels tab in navigation
- [x] Create menu dropdown (Post, Story, Reels)
- [x] ReelCard UI components
- [x] TypeScript compilation passes

## In Progress 🔄
- [ ] Hidden controls with tap-to-show and 3s auto-hide
- [ ] Watch time tracking and 50% completion detection
- [ ] Preference algorithm for reels (genre-based, author-based)
- [ ] Preference algorithm for posts (integrated with reels logic)
- [ ] Trending algorithm (engagement + watch time + recency)
- [ ] Background batch loading (10 videos at a time)
- [ ] Status thumbnails in stories
- [ ] Full integration testing
- [ ] Final TypeScript verification
- [ ] Git commit and push
- [ ] EAS CLI build

## Key Requirements
1. Production-grade, no workarounds
2. Hidden controls until tap (fade in/out animation)
3. Autoplay when navigating to reels tab
4. 50% watch detection triggers genre preference
5. Trending combines engagement + watch time + recency
6. Preference affects both reels and posts feed
7. Background 10-batch preloading
8. Status shows latest thumbnail
9. NO TypeScript errors
10. Must sync with existing implementation
