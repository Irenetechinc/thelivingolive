import React, {
  useEffect, useState, useCallback, useRef, useMemo,
} from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal,
  ActivityIndicator, FlatList, RefreshControl, Linking, Alert,
  Image, Animated, Dimensions, Share, TextInput,
  KeyboardAvoidingView, Platform, TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import {
  fetchChurches, fetchMyChurch, setMyChurch, clearMyChurch,
  fetchTodayBulletin, fetchBulletinArchive, fetchBulletin,
  fetchChurchExtras, fetchChurchAds,
  initiateBulletinPayment, verifyBulletinPayment,
  fetchBulletinSocial, toggleBulletinLike, fetchBulletinComments,
  postBulletinComment, toggleCommentLike,
  type Church, type Bulletin, type ChurchExtras, type ChurchAd,
  type BulletinSocial, type BulletinComment,
} from "../../lib/api";
import { colors, spacing, radii, typography, shadows } from "../../theme/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Props = NativeStackScreenProps<RootStackParamList, "Bulletin">;

// ── Types ─────────────────────────────────────────────────────────────────────
type SlideItem =
  | { kind: "announcement"; id: string; text: string; type: string; banner_url?: string | null }
  | { kind: "ad"; id: string; title: string; image_url?: string | null; link_url?: string | null };

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonBox({ width, height, style, borderRadius: br }: {
  width?: number | string; height?: number; style?: object; borderRadius?: number;
}) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View style={[{
      backgroundColor: colors.parchmentDark, borderRadius: br ?? 8,
      width: width ?? "100%", height: height ?? 16, opacity,
    }, style]} />
  );
}

// ── Auto slider (announcements + ads) ─────────────────────────────────────────
const ANNOUNCEMENT_PALETTES: Record<string, { bg: string[]; text: string; badge: string }> = {
  general:  { bg: ["#3E4A2F", "#5B6B45"], text: "#E8F2DC", badge: "#8A9A6B" },
  urgent:   { bg: ["#7A1C1C", "#B03030"], text: "#FFE8E8", badge: "#E07060" },
  event:    { bg: ["#5C440A", "#8A6510"], text: "#FFF4D0", badge: "#C9A227" },
  reminder: { bg: ["#1C3A52", "#2B5A7A"], text: "#D8F0FF", badge: "#5B8FA8" },
};

function AutoSlider({ slides, onAdPress }: { slides: SlideItem[]; onAdPress: (url: string) => void }) {
  const scrollRef = useRef<ScrollView>(null);
  const [active, setActive] = useState(0);
  const dotScale = useRef(slides.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % slides.length;
        scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
        return next;
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [slides.length]);

  useEffect(() => {
    dotScale.forEach((s, i) => {
      Animated.spring(s, { toValue: i === active ? 1.5 : 1, useNativeDriver: true }).start();
    });
  }, [active]);

  if (slides.length === 0) return null;

  return (
    <View style={{ width: SCREEN_WIDTH }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={slides.length > 1}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setActive(idx);
        }}
        style={{ width: SCREEN_WIDTH }}
      >
        {slides.map((slide) => (
          <SlideCard key={`${slide.kind}-${slide.id}`} slide={slide} onAdPress={onAdPress} />
        ))}
      </ScrollView>

      {slides.length > 1 && (
        <View style={sliderStyles.dots}>
          {slides.map((_, i) => (
            <Animated.View
              key={i}
              style={[
                sliderStyles.dot,
                i === active ? sliderStyles.dotActive : sliderStyles.dotInactive,
                { transform: [{ scale: dotScale[i] }] },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function SlideCard({ slide, onAdPress }: { slide: SlideItem; onAdPress: (url: string) => void }) {
  const scaleAnim = useRef(new Animated.Value(0.97)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80 }).start();
  }, []);

  if (slide.kind === "announcement") {
    const palette = ANNOUNCEMENT_PALETTES[slide.type] ?? ANNOUNCEMENT_PALETTES.general;
    if (slide.banner_url) {
      return (
        <View style={{ width: SCREEN_WIDTH, height: 200 }}>
          <Image source={{ uri: slide.banner_url }} style={sliderStyles.bannerImage} resizeMode="cover" />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.6)"]}
            style={sliderStyles.bannerOverlay}
          />
          {slide.text ? (
            <View style={sliderStyles.bannerTextWrap}>
              <Text style={sliderStyles.bannerLabel}>{slide.type.toUpperCase()}</Text>
              <Text style={sliderStyles.bannerText} numberOfLines={2}>{slide.text}</Text>
            </View>
          ) : null}
        </View>
      );
    }
    return (
      <LinearGradient colors={palette.bg} style={sliderStyles.announcementSlide}>
        <View style={[sliderStyles.annBadge, { backgroundColor: palette.badge + "40" }]}>
          <Text style={[sliderStyles.annBadgeText, { color: palette.badge === "#8A9A6B" ? "#D4E8C0" : palette.badge }]}>
            {slide.type.toUpperCase()}
          </Text>
        </View>
        <Text style={[sliderStyles.annSlideText, { color: palette.text }]} numberOfLines={5}>
          {slide.text}
        </Text>
        <View style={sliderStyles.annDecor} />
      </LinearGradient>
    );
  }

  // Ad slide
  return (
    <Pressable
      style={{ width: SCREEN_WIDTH, height: 200 }}
      onPress={() => slide.link_url && onAdPress(slide.link_url)}
    >
      {slide.image_url ? (
        <>
          <Image source={{ uri: slide.image_url }} style={sliderStyles.bannerImage} resizeMode="cover" />
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.65)"]} style={sliderStyles.bannerOverlay} />
          <View style={sliderStyles.bannerTextWrap}>
            <Text style={sliderStyles.bannerLabel}>FEATURED</Text>
            <Text style={sliderStyles.bannerText} numberOfLines={2}>{slide.title}</Text>
            {slide.link_url && <Text style={sliderStyles.adCta}>Learn more →</Text>}
          </View>
        </>
      ) : (
        <LinearGradient colors={["#2E3A1F", "#4A5A36"]} style={sliderStyles.announcementSlide}>
          <View style={[sliderStyles.annBadge, { backgroundColor: "rgba(201,162,39,0.2)" }]}>
            <Text style={[sliderStyles.annBadgeText, { color: "#E2C060" }]}>FEATURED</Text>
          </View>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>🫒</Text>
          <Text style={[sliderStyles.annSlideText, { color: "#E8F2DC" }]} numberOfLines={3}>{slide.title}</Text>
          {slide.link_url && <Text style={sliderStyles.adCta}>Learn more →</Text>}
        </LinearGradient>
      )}
    </Pressable>
  );
}

const sliderStyles = StyleSheet.create({
  announcementSlide: {
    width: SCREEN_WIDTH, height: 200,
    padding: spacing.lg, justifyContent: "center",
  },
  annBadge: {
    alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radii.pill, marginBottom: 12,
  },
  annBadgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
  annSlideText: { fontSize: 17, fontWeight: "600", lineHeight: 26 },
  annDecor: {
    position: "absolute", right: -20, bottom: -30,
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  bannerImage: { width: SCREEN_WIDTH, height: 200, position: "absolute" },
  bannerOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, height: 120 },
  bannerTextWrap: { position: "absolute", bottom: 16, left: spacing.lg, right: spacing.lg },
  bannerLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5, color: "rgba(255,255,255,0.7)", marginBottom: 4 },
  bannerText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF", lineHeight: 22 },
  adCta: { color: "#E2C060", fontWeight: "600", fontSize: 12, marginTop: 4 },
  dots: { flexDirection: "row", justifyContent: "center", paddingVertical: 10, gap: 6 },
  dot: { height: 6, borderRadius: 3 },
  dotActive: { width: 18, backgroundColor: colors.gold },
  dotInactive: { width: 6, backgroundColor: colors.parchmentDark },
});

// ── Order of Service strip ─────────────────────────────────────────────────────
function OrderOfServiceStrip({ items }: { items: { time?: string; item: string; notes?: string }[] }) {
  const scrollRef = useRef<ScrollView>(null);
  const [autoIdx, setAutoIdx] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      setAutoIdx((prev) => {
        const next = (prev + 1) % items.length;
        scrollRef.current?.scrollTo({ x: next * (OOS_CARD_W + spacing.sm), animated: true });
        return next;
      });
    }, 3500);
    return () => clearInterval(timer);
  }, [items.length]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ width: SCREEN_WIDTH }}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
    >
      {items.map((item, i) => (
        <View key={i} style={oosStyles.card}>
          {item.time ? (
            <Text style={oosStyles.time}>{item.time}</Text>
          ) : (
            <Text style={oosStyles.num}>{String(i + 1).padStart(2, "0")}</Text>
          )}
          <Text style={oosStyles.item} numberOfLines={2}>{item.item}</Text>
          {item.notes ? <Text style={oosStyles.notes} numberOfLines={2}>{item.notes}</Text> : null}
        </View>
      ))}
    </ScrollView>
  );
}

const OOS_CARD_W = 160;
const oosStyles = StyleSheet.create({
  card: {
    width: OOS_CARD_W, borderRadius: radii.lg,
    backgroundColor: colors.white, padding: spacing.md,
    ...shadows.card, justifyContent: "center",
    borderTopWidth: 3, borderTopColor: colors.gold,
  },
  time: { fontSize: 11, fontWeight: "700", color: colors.gold, marginBottom: 6, letterSpacing: 0.5 },
  num: { fontSize: 22, fontWeight: "700", color: colors.oliveFaint, marginBottom: 4 },
  item: { fontSize: 13, fontWeight: "600", color: colors.ink, lineHeight: 18 },
  notes: { fontSize: 11, color: colors.inkFaint, marginTop: 4, lineHeight: 16 },
});

// ── Social bar (like / comment / share) ───────────────────────────────────────
function SocialBar({
  bulletinId,
  initialSocial,
  onCommentPress,
  onShare,
}: {
  bulletinId: string;
  initialSocial: BulletinSocial;
  onCommentPress: () => void;
  onShare: () => void;
}) {
  const [social, setSocial] = useState(initialSocial);
  const heartScale = useRef(new Animated.Value(1)).current;

  async function handleLike() {
    // Optimistic
    const wasLiked = social.liked;
    setSocial((s) => ({ ...s, liked: !s.liked, likes: s.likes + (s.liked ? -1 : 1) }));
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.4, useNativeDriver: true, speed: 30 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true }),
    ]).start();
    try {
      const res = await toggleBulletinLike(bulletinId);
      setSocial((s) => ({ ...s, liked: res.liked, likes: res.likes }));
    } catch {
      setSocial((s) => ({ ...s, liked: wasLiked, likes: s.likes + (wasLiked ? 1 : -1) }));
    }
  }

  return (
    <View style={socialStyles.bar}>
      <TouchableOpacity style={socialStyles.btn} onPress={handleLike} activeOpacity={0.7}>
        <Animated.Text style={[socialStyles.icon, { transform: [{ scale: heartScale }] }]}>
          {social.liked ? "❤️" : "🤍"}
        </Animated.Text>
        <Text style={[socialStyles.count, social.liked && { color: "#E04050" }]}>
          {social.likes > 0 ? social.likes : "Like"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={socialStyles.btn} onPress={onCommentPress} activeOpacity={0.7}>
        <Text style={socialStyles.icon}>💬</Text>
        <Text style={socialStyles.count}>
          {social.comments > 0 ? `${social.comments} Comment${social.comments !== 1 ? "s" : ""}` : "Comment"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={socialStyles.btn} onPress={onShare} activeOpacity={0.7}>
        <Text style={socialStyles.icon}>↗️</Text>
        <Text style={socialStyles.count}>Share</Text>
      </TouchableOpacity>
    </View>
  );
}

const socialStyles = StyleSheet.create({
  bar: {
    flexDirection: "row", backgroundColor: colors.white,
    borderRadius: radii.lg, marginTop: 8, overflow: "hidden",
    ...shadows.subtle,
  },
  btn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 12, gap: 5,
  },
  icon: { fontSize: 16 },
  count: { fontSize: 12, fontWeight: "600", color: colors.inkSoft },
});

// ── Comments modal ─────────────────────────────────────────────────────────────
function CommentsModal({
  visible,
  bulletinId,
  bulletinTitle,
  onClose,
  onCountChange,
}: {
  visible: boolean;
  bulletinId: string;
  bulletinTitle: string;
  onClose: () => void;
  onCountChange: (n: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<BulletinComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ id: string; handle: string } | null>(null);
  const [posting, setPosting] = useState(false);
  const listRef = useRef<ScrollView>(null);
  const inputAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    loadComments();
  }, [visible, bulletinId]);

  async function loadComments() {
    setLoading(true);
    const data = await fetchBulletinComments(bulletinId);
    setComments(data);
    onCountChange(data.reduce((s, c) => s + 1 + c.replies.length, 0));
    setLoading(false);
  }

  async function handlePost() {
    if (!text.trim() || posting) return;
    setPosting(true);
    try {
      const comment = await postBulletinComment(bulletinId, text.trim(), replyingTo?.id);
      if (replyingTo) {
        setComments((cs) => cs.map((c) =>
          c.id === replyingTo.id ? { ...c, replies: [...c.replies, comment] } : c
        ));
      } else {
        setComments((cs) => [...cs, comment]);
      }
      setText("");
      setReplyingTo(null);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      Alert.alert("Couldn't post", e.message ?? "Please try again.");
    } finally {
      setPosting(false);
    }
  }

  async function handleCommentLike(bulletinId: string, commentId: string, parentId?: string) {
    try {
      const res = await toggleCommentLike(bulletinId, commentId);
      setComments((cs) => cs.map((c) => {
        if (c.id === commentId) return { ...c, liked: res.liked, likeCount: res.likeCount };
        if (parentId && c.id === parentId) {
          return { ...c, replies: c.replies.map((r) => r.id === commentId ? { ...r, liked: res.liked, likeCount: res.likeCount } : r) };
        }
        return c;
      }));
    } catch { /* silent */ }
  }

  function CommentRow({ comment, parentId }: { comment: BulletinComment; parentId?: string }) {
    const age = useMemo(() => {
      const d = new Date(comment.createdAt);
      const diff = Date.now() - d.getTime();
      if (diff < 60000) return "just now";
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return `${Math.floor(diff / 86400000)}d ago`;
    }, [comment.createdAt]);

    return (
      <View style={[commentStyles.row, parentId && commentStyles.replyRow]}>
        <View style={commentStyles.avatar}>
          <Text style={commentStyles.avatarText}>{comment.handle.slice(1, 3).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={commentStyles.bubble}>
            <Text style={commentStyles.handle}>{comment.handle}</Text>
            <Text style={commentStyles.body}>{comment.body}</Text>
          </View>
          <View style={commentStyles.meta}>
            <Text style={commentStyles.age}>{age}</Text>
            <TouchableOpacity
              onPress={() => handleCommentLike(bulletinId, comment.id, parentId)}
              style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
            >
              <Text style={{ fontSize: 12 }}>{comment.liked ? "❤️" : "🤍"}</Text>
              {comment.likeCount > 0 && (
                <Text style={commentStyles.age}>{comment.likeCount}</Text>
              )}
            </TouchableOpacity>
            {!parentId && (
              <TouchableOpacity onPress={() => setReplyingTo({ id: comment.id, handle: comment.handle })}>
                <Text style={commentStyles.replyBtn}>Reply</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[commentStyles.sheet, { paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={commentStyles.header}>
          <View style={commentStyles.handleBar} />
          <Text style={commentStyles.title} numberOfLines={1}>{bulletinTitle}</Text>
          <Text style={commentStyles.subtitle}>Comments</Text>
          <Pressable onPress={onClose} style={commentStyles.closeBtn}>
            <Text style={commentStyles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        {/* Comments list */}
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.olive} />
          </View>
        ) : (
          <ScrollView
            ref={listRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {comments.length === 0 && (
              <View style={{ alignItems: "center", paddingVertical: spacing.xl }}>
                <Text style={{ fontSize: 36, marginBottom: 12 }}>💬</Text>
                <Text style={{ ...typography.subtitle, color: colors.ink, marginBottom: 6 }}>No comments yet</Text>
                <Text style={{ ...typography.bodySmall, color: colors.inkFaint, textAlign: "center" }}>
                  Be the first to share your thoughts!
                </Text>
              </View>
            )}
            {comments.map((c) => (
              <View key={c.id}>
                <CommentRow comment={c} />
                {c.replies.map((r) => (
                  <CommentRow key={r.id} comment={r} parentId={c.id} />
                ))}
              </View>
            ))}
          </ScrollView>
        )}

        {/* Reply banner */}
        {replyingTo && (
          <View style={commentStyles.replyBanner}>
            <Text style={commentStyles.replyBannerText}>Replying to {replyingTo.handle}</Text>
            <TouchableOpacity onPress={() => setReplyingTo(null)}>
              <Text style={{ color: colors.olive, fontWeight: "700" }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Input */}
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={commentStyles.inputRow}>
            <TextInput
              style={commentStyles.input}
              placeholder={replyingTo ? `Reply to ${replyingTo.handle}…` : "Add a comment…"}
              placeholderTextColor={colors.inkFaint}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[commentStyles.sendBtn, (!text.trim() || posting) && { opacity: 0.4 }]}
              onPress={handlePost}
              disabled={!text.trim() || posting}
            >
              {posting ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={commentStyles.sendBtnText}>↑</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const commentStyles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.parchment },
  header: {
    paddingHorizontal: spacing.lg, paddingBottom: 16,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.parchmentDark,
    paddingTop: 12,
  },
  handleBar: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.parchmentDark,
    alignSelf: "center", marginBottom: 16,
  },
  title: { fontSize: 14, fontWeight: "700", color: colors.ink, textAlign: "center" },
  subtitle: { fontSize: 12, color: colors.inkFaint, textAlign: "center", marginTop: 2 },
  closeBtn: { position: "absolute", top: 12, right: spacing.lg, padding: 4 },
  closeBtnText: { fontSize: 16, color: colors.inkFaint },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  replyRow: { marginLeft: 40, marginTop: 8 },
  avatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.oliveFaint,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 11, fontWeight: "700", color: colors.olive },
  bubble: {
    backgroundColor: colors.white, borderRadius: radii.lg, padding: 10,
    borderTopLeftRadius: 4, ...shadows.subtle,
  },
  handle: { fontSize: 11, fontWeight: "700", color: colors.olive, marginBottom: 3 },
  body: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  meta: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 5, paddingLeft: 4 },
  age: { fontSize: 11, color: colors.inkFaint },
  replyBtn: { fontSize: 11, fontWeight: "600", color: colors.olive },
  replyBanner: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: colors.oliveFaint, paddingHorizontal: spacing.lg, paddingVertical: 8,
  },
  replyBannerText: { fontSize: 12, color: colors.olive, fontWeight: "500" },
  inputRow: {
    flexDirection: "row", gap: 8, padding: spacing.md,
    backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.parchmentDark,
    alignItems: "flex-end",
  },
  input: {
    flex: 1, backgroundColor: colors.parchment, borderRadius: radii.lg,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.ink,
    maxHeight: 100, minHeight: 40,
    borderWidth: 1, borderColor: colors.parchmentDark,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.olive,
    alignItems: "center", justifyContent: "center",
  },
  sendBtnText: { color: colors.white, fontSize: 18, fontWeight: "700" },
});

// ── Pulse animation wrapper ────────────────────────────────────────────────────
function FadeInView({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(anim, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, delay, useNativeDriver: true, tension: 70 }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: slideAnim }] }}>
      {children}
    </Animated.View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function BulletinScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<"loading" | "picker" | "askConfirm" | "bulletin">("loading");
  const [churches, setChurches] = useState<Church[]>([]);
  const [selectedChurch, setSelectedChurch] = useState<Church | null>(null);
  const [myChurch, setMyChurchState] = useState<Church | null>(null);
  const [todayBulletin, setTodayBulletin] = useState<Bulletin | null>(null);
  const [archive, setArchive] = useState<Bulletin[]>([]);
  const [extras, setExtras] = useState<ChurchExtras>({ announcements: [], orderOfService: [], social: {} });
  const [ads, setAds] = useState<ChurchAd[]>([]);
  const [viewingBulletin, setViewingBulletin] = useState<Bulletin | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [extrasLoading, setExtrasLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [payingFor, setPayingFor] = useState<string | null>(null);

  // Social state keyed by bulletinId
  const [socialMap, setSocialMap] = useState<Record<string, BulletinSocial>>({});
  const [commentModal, setCommentModal] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => { bootstrap(); }, []);

  async function bootstrap() {
    setLoading(true);
    try {
      const membership = await fetchMyChurch();
      if (membership?.churches) {
        const church = membership.churches as Church;
        setMyChurchState(church);
        setSelectedChurch(church);
        await loadAll(church.id);
        setPhase("bulletin");
      } else {
        const list = await fetchChurches();
        setChurches(list);
        setPhase("picker");
      }
    } catch {
      try { const list = await fetchChurches(); setChurches(list); } catch { /* no internet */ }
      setPhase("picker");
    } finally {
      setLoading(false);
    }
  }

  async function loadAll(churchId: string) {
    const [todayRes, archiveRes] = await Promise.allSettled([
      fetchTodayBulletin(churchId),
      fetchBulletinArchive(churchId),
    ]);
    const newBulletins: Bulletin[] = [];
    if (todayRes.status === "fulfilled" && todayRes.value.bulletin) {
      setTodayBulletin(todayRes.value.bulletin);
      newBulletins.push(todayRes.value.bulletin);
    } else {
      setTodayBulletin(null);
    }
    if (archiveRes.status === "fulfilled") {
      setArchive(archiveRes.value.bulletins);
      newBulletins.push(...archiveRes.value.bulletins);
    }

    // Load social data for bulletins in background
    loadSocialData(newBulletins);

    setExtrasLoading(true);
    Promise.allSettled([
      fetchChurchExtras(churchId).then(setExtras),
      fetchChurchAds(churchId).then(setAds),
    ]).finally(() => setExtrasLoading(false));
  }

  async function loadSocialData(bulletins: Bulletin[]) {
    const results = await Promise.allSettled(
      bulletins.map((b) => fetchBulletinSocial(b.id).then((s) => ({ id: b.id, social: s })))
    );
    const map: Record<string, BulletinSocial> = {};
    for (const r of results) {
      if (r.status === "fulfilled") map[r.value.id] = r.value.social;
    }
    setSocialMap((prev) => ({ ...prev, ...map }));
  }

  async function onSelectChurch(church: Church) {
    setSelectedChurch(church);
    setLoading(true);
    try {
      await loadAll(church.id);
      if (!myChurch) setPhase("askConfirm");
      else setPhase("bulletin");
    } catch {
      setPhase("bulletin");
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmChurch(yes: boolean) {
    if (yes && selectedChurch) {
      try { await setMyChurch(selectedChurch.id); } catch { /* silent */ }
      setMyChurchState(selectedChurch);
    }
    setPhase("bulletin");
  }

  async function onChangeChurch() {
    try { await clearMyChurch(); } catch { /* silent */ }
    setMyChurchState(null); setSelectedChurch(null);
    setExtras({ announcements: [], orderOfService: [], social: {} }); setAds([]);
    setPhase("loading"); setLoading(true);
    try { const list = await fetchChurches(); setChurches(list); } catch { /* silent */ }
    setLoading(false); setPhase("picker");
  }

  async function onRefresh() {
    if (!selectedChurch) return;
    setRefreshing(true);
    try { await loadAll(selectedChurch.id); } catch { /* silent */ }
    setRefreshing(false);
  }

  async function openBulletin(bulletin: Bulletin) {
    if (!selectedChurch) return;
    setLoading(true);
    try {
      const res = await fetchBulletin(selectedChurch.id, bulletin.id);
      setViewingBulletin(res.bulletin);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }

  async function payForBulletin(bulletin: Bulletin) {
    if (!selectedChurch) return;
    setPayingFor(bulletin.id);
    try {
      const res = await initiateBulletinPayment(bulletin.id);
      await Linking.openURL(res.paymentLink);
      Alert.alert("Verify Payment", "Did you complete the payment?", [
        { text: "Not yet", style: "cancel", onPress: () => setPayingFor(null) },
        {
          text: "Yes, verify",
          onPress: async () => {
            try {
              const verify = await verifyBulletinPayment(bulletin.id, res.txRef);
              if (verify.paid) openBulletin(bulletin);
              else Alert.alert("Payment not confirmed", "Please try again.");
            } catch { Alert.alert("Verification issue", "Check your connection and try again."); }
            finally { setPayingFor(null); }
          },
        },
      ]);
    } catch {
      Alert.alert("Payment unavailable", "Check your connection and try again.");
      setPayingFor(null);
    }
  }

  function handleShare(bulletin: Bulletin) {
    Share.share({
      title: bulletin.title,
      message: `📋 ${bulletin.title}\n\n${bulletin.content_preview ?? ""}\n\nRead on The Living Olive app`,
    });
  }

  function openComments(bulletin: Bulletin) {
    setCommentModal({ id: bulletin.id, title: bulletin.title });
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === "loading" || loading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#1C2712", "#2E3A1F", "#3E4A2F"]} style={[styles.header, { paddingTop: 52 + insets.top }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>📋 Bulletin</Text>
        </LinearGradient>
        <View style={{ padding: spacing.lg }}>
          <SkeletonBox height={10} width={120} style={{ marginBottom: 14 }} />
          <SkeletonBox height={170} borderRadius={radii.xl} style={{ marginBottom: spacing.xl }} />
          <SkeletonBox height={200} borderRadius={0} style={{ marginBottom: spacing.xl }} />
          <SkeletonBox height={10} width={160} style={{ marginBottom: 12 }} />
          <SkeletonBox height={90} borderRadius={radii.lg} style={{ marginBottom: 8 }} />
          <SkeletonBox height={90} borderRadius={radii.lg} />
        </View>
      </View>
    );
  }

  // ── Church picker ──────────────────────────────────────────────────────────
  if (phase === "picker") {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#1C2712", "#2E3A1F", "#3E4A2F"]} style={[styles.pickerHeader, { paddingTop: 52 + insets.top }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.pickerTitle}>Select Your Church</Text>
          <Text style={styles.pickerSub}>Choose your place of worship to view their bulletin</Text>
        </LinearGradient>
        {churches.length === 0 ? (
          <View style={styles.center}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>📋</Text>
            <Text style={styles.emptyTitle}>No bulletins yet</Text>
            <Text style={styles.emptyDesc}>No churches have published bulletins at this time.</Text>
          </View>
        ) : (
          <FlatList
            data={churches}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.lg + insets.bottom }}
            renderItem={({ item }) => (
              <Pressable style={({ pressed }) => [styles.churchCard, pressed && styles.pressed]} onPress={() => onSelectChurch(item)}>
                {item.logo_url ? (
                  <Image source={{ uri: item.logo_url }} style={styles.churchLogo} resizeMode="contain" />
                ) : (
                  <View style={styles.churchIconWrap}><Text style={{ fontSize: 24 }}>⛪</Text></View>
                )}
                <View style={styles.churchBody}>
                  <Text style={styles.churchName}>{item.name}</Text>
                  {item.description ? <Text style={styles.churchDesc} numberOfLines={2}>{item.description}</Text> : null}
                </View>
                <Text style={{ fontSize: 24, color: colors.oliveFaint, fontWeight: "300", paddingRight: spacing.md }}>›</Text>
              </Pressable>
            )}
          />
        )}
      </View>
    );
  }

  // ── Confirm church ─────────────────────────────────────────────────────────
  if (phase === "askConfirm") {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#1C2712", "#2E3A1F", "#3E4A2F"]} style={[styles.pickerHeader, { paddingTop: 52 + insets.top }]}>
          <Text style={styles.pickerTitle}>Is this your church?</Text>
        </LinearGradient>
        <View style={[styles.confirmCard, { paddingBottom: spacing.xl + insets.bottom }]}>
          {selectedChurch?.logo_url
            ? <Image source={{ uri: selectedChurch.logo_url }} style={styles.confirmLogo} resizeMode="contain" />
            : <Text style={{ fontSize: 56, marginBottom: 16 }}>⛪</Text>}
          <Text style={styles.confirmChurchName}>{selectedChurch?.name}</Text>
          <Text style={styles.confirmQuestion}>Is {selectedChurch?.name} your place of worship?</Text>
          <Text style={styles.confirmHint}>If yes, you'll go straight to their bulletin next time.</Text>
          <Pressable style={[styles.confirmBtn, styles.confirmBtnYes]} onPress={() => onConfirmChurch(true)}>
            <Text style={styles.confirmBtnTextYes}>Yes, this is my church</Text>
          </Pressable>
          <Pressable style={[styles.confirmBtn, styles.confirmBtnNo]} onPress={() => onConfirmChurch(false)}>
            <Text style={styles.confirmBtnTextNo}>No, just browsing</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Bulletin view ──────────────────────────────────────────────────────────
  const hasOrderOfService = extras.orderOfService?.length > 0;
  const hasSocialLinks = extras.social && Object.values(extras.social).some(Boolean);

  // Build slide array: announcements first, then ads
  const slides: SlideItem[] = [
    ...(extras.announcements ?? []).map((a) => ({
      kind: "announcement" as const,
      id: a.id,
      text: a.text,
      type: a.type,
      banner_url: (a as any).banner_url ?? null,
    })),
    ...ads.map((ad) => ({
      kind: "ad" as const,
      id: ad.id,
      title: ad.title,
      image_url: ad.image_url,
      link_url: ad.link_url,
    })),
  ];

  function getSocial(id: string): BulletinSocial {
    return socialMap[id] ?? { likes: 0, comments: 0, liked: false };
  }

  return (
    <View style={styles.container}>
      {/* ── Full bulletin viewer modal ── */}
      <Modal visible={!!viewingBulletin} animationType="slide" presentationStyle="pageSheet">
        {viewingBulletin && (
          <View style={{ flex: 1, backgroundColor: colors.parchment }}>
            <LinearGradient colors={["#1C2712", "#2E3A1F", "#3E4A2F"]} style={styles.modalHeader}>
              <Pressable onPress={() => setViewingBulletin(null)} style={styles.backBtn}>
                <Text style={styles.backBtnText}>✕ Close</Text>
              </Pressable>
              <Text style={styles.modalTitle} numberOfLines={2}>{viewingBulletin.title}</Text>
              <Text style={styles.modalMeta}>
                {selectedChurch?.name} · {viewingBulletin.frequency}
                {viewingBulletin.publish_at ? ` · ${new Date(viewingBulletin.publish_at).toLocaleDateString()}` : ""}
              </Text>
            </LinearGradient>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl + insets.bottom }}>
              {viewingBulletin.requiresPayment ? (
                <View style={styles.paywallBox}>
                  <Text style={{ fontSize: 48, marginBottom: 16 }}>🔒</Text>
                  <Text style={styles.paywallTitle}>Paid Bulletin</Text>
                  <Text style={styles.paywallDesc}>
                    This bulletin is available for ₦{viewingBulletin.price_ngn?.toLocaleString()}. Purchase to read the full content.
                  </Text>
                  <Pressable
                    style={[styles.payBtn, payingFor === viewingBulletin.id && { opacity: 0.6 }]}
                    onPress={() => payForBulletin(viewingBulletin)}
                    disabled={payingFor === viewingBulletin.id}
                  >
                    {payingFor === viewingBulletin.id
                      ? <ActivityIndicator color={colors.white} />
                      : <Text style={styles.payBtnText}>Pay ₦{viewingBulletin.price_ngn?.toLocaleString()} to Read</Text>}
                  </Pressable>
                </View>
              ) : (
                <Text style={{ ...typography.body, color: colors.ink, lineHeight: 28 }}>
                  {(viewingBulletin.content ?? "").replace(/<[^>]+>/g, "\n").replace(/\n{3,}/g, "\n\n").trim()}
                </Text>
              )}
            </ScrollView>
            {/* Social bar inside bulletin viewer */}
            <View style={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.md }}>
              <SocialBar
                bulletinId={viewingBulletin.id}
                initialSocial={getSocial(viewingBulletin.id)}
                onCommentPress={() => openComments(viewingBulletin)}
                onShare={() => handleShare(viewingBulletin)}
              />
            </View>
          </View>
        )}
      </Modal>

      {/* ── Comments modal ── */}
      {commentModal && (
        <CommentsModal
          visible={!!commentModal}
          bulletinId={commentModal.id}
          bulletinTitle={commentModal.title}
          onClose={() => setCommentModal(null)}
          onCountChange={(n) => {
            setSocialMap((prev) => ({
              ...prev,
              [commentModal.id]: { ...getSocial(commentModal.id), comments: n },
            }));
          }}
        />
      )}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <LinearGradient colors={["#1C2712", "#2E3A1F", "#3E4A2F"]} style={[styles.header, { paddingTop: 52 + insets.top }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </Pressable>
          <View style={styles.headerRow}>
            {selectedChurch?.logo_url ? (
              <Image source={{ uri: selectedChurch.logo_url }} style={styles.headerLogo} resizeMode="contain" />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>📋 Bulletin</Text>
              <Text style={styles.headerChurch}>{selectedChurch?.name}</Text>
            </View>
          </View>
          <Pressable onPress={onChangeChurch} style={styles.changeBtn}>
            <Text style={styles.changeBtnText}>Change church</Text>
          </Pressable>
        </LinearGradient>

        {/* ── 1. TODAY'S BULLETIN (first) ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>TODAY'S BULLETIN</Text>
            {todayBulletin && <View style={styles.liveDot} />}
          </View>

          <FadeInView delay={50}>
            {todayBulletin ? (
              <Pressable
                style={({ pressed }) => [styles.todayCard, pressed && styles.pressed]}
                onPress={() => openBulletin(todayBulletin)}
              >
                <LinearGradient colors={["#2E3A1F", "#3E4A2F", "#5B6B45"]} style={styles.todayGrad}>
                  {/* Decorative circles */}
                  <View style={styles.decor1} />
                  <View style={styles.decor2} />

                  <View style={styles.todayRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.todayFreqRow}>
                        <Text style={styles.todayFreq}>{todayBulletin.frequency?.toUpperCase() ?? "BULLETIN"}</Text>
                        {todayBulletin.is_paid && (
                          <View style={styles.paidBadge}>
                            <Text style={styles.paidBadgeText}>₦{todayBulletin.price_ngn?.toLocaleString()}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.todayTitle}>{todayBulletin.title}</Text>
                      {todayBulletin.content_preview ? (
                        <Text style={styles.todayPreview} numberOfLines={3}>{todayBulletin.content_preview}</Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.todayFooter}>
                    <Text style={styles.todayDate}>
                      {todayBulletin.publish_at
                        ? new Date(todayBulletin.publish_at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
                        : "Today"}
                    </Text>
                    <Text style={styles.readMore}>{todayBulletin.hasAccess ? "Read bulletin →" : "View →"}</Text>
                  </View>
                </LinearGradient>
              </Pressable>
            ) : (
              <View style={styles.noBulletinCard}>
                <Text style={{ fontSize: 36, marginBottom: 12 }}>📭</Text>
                <Text style={styles.noBulletinTitle}>No bulletin today</Text>
                <Text style={styles.noBulletinDesc}>
                  {selectedChurch?.name} hasn't published a bulletin for today yet.
                </Text>
              </View>
            )}
          </FadeInView>

          {/* Social bar for today's bulletin */}
          {todayBulletin && (
            <FadeInView delay={120}>
              <SocialBar
                bulletinId={todayBulletin.id}
                initialSocial={getSocial(todayBulletin.id)}
                onCommentPress={() => openComments(todayBulletin)}
                onShare={() => handleShare(todayBulletin)}
              />
            </FadeInView>
          )}
        </View>

        {/* ── 2. ANNOUNCEMENTS + ADS AUTO-SLIDER (full width) ── */}
        {(extrasLoading && slides.length === 0) ? (
          <View style={{ marginBottom: spacing.xl }}>
            <View style={styles.section}>
              <SkeletonBox height={10} width={140} style={{ marginBottom: 12 }} />
            </View>
            <SkeletonBox height={200} borderRadius={0} />
          </View>
        ) : slides.length > 0 ? (
          <FadeInView delay={180}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>ANNOUNCEMENTS & FEATURED</Text>
            </View>
            <AutoSlider slides={slides} onAdPress={(url) => Linking.openURL(url)} />
            <View style={{ height: spacing.xl }} />
          </FadeInView>
        ) : null}

        {/* ── 3. ORDER OF SERVICE (horizontal strip, edge-to-edge) ── */}
        {hasOrderOfService && (
          <FadeInView delay={240}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>ORDER OF SERVICE</Text>
            </View>
            <View style={{ marginBottom: spacing.xl }}>
              <OrderOfServiceStrip items={extras.orderOfService} />
            </View>
          </FadeInView>
        )}

        {/* ── 4. PREVIOUS BULLETINS (archive) ── */}
        <View style={styles.section}>
          <View style={styles.archiveHeaderRow}>
            <Text style={styles.sectionLabel}>PREVIOUS BULLETINS</Text>
            {!showArchive && archive.length > 3 && (
              <Pressable onPress={() => setShowArchive(true)}>
                <Text style={styles.showAll}>Show all</Text>
              </Pressable>
            )}
          </View>

          {archive.length === 0 ? (
            <Text style={styles.noArchive}>No previous bulletins available.</Text>
          ) : (
            (showArchive ? archive : archive.slice(0, 3)).map((b, idx) => (
              <FadeInView key={b.id} delay={300 + idx * 60}>
                <Pressable
                  style={({ pressed }) => [styles.archiveCard, pressed && styles.pressed]}
                  onPress={() => openBulletin(b)}
                >
                  <LinearGradient
                    colors={["#3E4A2F15", "#00000000"]}
                    style={styles.archiveGradAccent}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.archiveTitle}>{b.title}</Text>
                    <Text style={styles.archiveMeta}>
                      {b.frequency?.charAt(0).toUpperCase() + (b.frequency?.slice(1) ?? "")}
                      {b.publish_at ? ` · ${new Date(b.publish_at).toLocaleDateString()}` : ""}
                    </Text>
                  </View>
                  {b.is_paid && <Text style={styles.archivePaid}>₦{b.price_ngn?.toLocaleString()}</Text>}
                  <Text style={styles.archiveArrow}>›</Text>
                </Pressable>
                <SocialBar
                  bulletinId={b.id}
                  initialSocial={getSocial(b.id)}
                  onCommentPress={() => openComments(b)}
                  onShare={() => handleShare(b)}
                />
                <View style={{ height: spacing.md }} />
              </FadeInView>
            ))
          )}

          {showArchive && (
            <Pressable onPress={() => setShowArchive(false)} style={{ alignItems: "center", paddingVertical: spacing.md }}>
              <Text style={{ color: colors.inkFaint, fontSize: 13 }}>Show less ↑</Text>
            </Pressable>
          )}
        </View>

        {/* ── 5. Social links ── */}
        {hasSocialLinks && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CONNECT WITH US</Text>
            <View style={styles.socialRow}>
              {extras.social.website && <SocialLink label="🌐 Website" url={extras.social.website} />}
              {extras.social.facebook && <SocialLink label="📘 Facebook" url={extras.social.facebook} />}
              {extras.social.instagram && <SocialLink label="📸 Instagram" url={extras.social.instagram} />}
              {extras.social.twitter && <SocialLink label="🐦 Twitter/X" url={extras.social.twitter} />}
              {extras.social.youtube && <SocialLink label="▶️ YouTube" url={extras.social.youtube} />}
            </View>
          </View>
        )}

        {/* ── 6. Explore ── */}
        <View style={[styles.section, { marginBottom: 0 }]}>
          <Text style={styles.sectionLabel}>EXPLORE</Text>
          <View style={styles.exploreRow}>
            <ExploreBtn icon="📖" label="Bible" onPress={() => navigation.navigate("BibleHome" as any)} />
            <ExploreBtn icon="🙏" label="Prayer" onPress={() => navigation.navigate("Prayer" as any)} />
            <ExploreBtn icon="🎵" label="Hymns" onPress={() => navigation.navigate("HymnsList" as any)} />
          </View>
        </View>

        <View style={{ height: spacing.xxxl + insets.bottom }} />
      </ScrollView>
    </View>
  );
}

function SocialLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.socialLinkBtn, pressed && { opacity: 0.75 }]}
      onPress={() => Linking.openURL(url)}
    >
      <Text style={styles.socialLinkText}>{label}</Text>
    </Pressable>
  );
}

function ExploreBtn({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.exploreBtn, pressed && styles.pressed]} onPress={onPress}>
      <Text style={{ fontSize: 30, marginBottom: 6 }}>{icon}</Text>
      <Text style={styles.exploreBtnLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { ...typography.subtitle, color: colors.ink, marginBottom: 8 },
  emptyDesc: { ...typography.bodySmall, color: colors.inkSoft, textAlign: "center" },

  // Header
  header: { paddingHorizontal: spacing.lg, paddingBottom: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: 8 },
  headerLogo: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: "rgba(255,255,255,0.1)" },
  headerTitle: { fontSize: 22, fontWeight: "700", color: colors.white },
  headerChurch: { fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 2 },
  backBtn: { marginBottom: 10 },
  backBtnText: { color: "rgba(255,255,255,0.7)", fontSize: 15, fontWeight: "500" },
  changeBtn: {
    alignSelf: "flex-start", paddingVertical: 5, paddingHorizontal: 14,
    borderRadius: radii.pill, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  changeBtnText: { color: "rgba(255,255,255,0.6)", fontSize: 12 },

  // Picker
  pickerHeader: { paddingBottom: 28, paddingHorizontal: spacing.lg },
  pickerTitle: { fontSize: 26, fontWeight: "700", color: colors.white, marginBottom: 6 },
  pickerSub: { fontSize: 14, color: "rgba(255,255,255,0.6)" },
  churchCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.white,
    borderRadius: radii.xl, overflow: "hidden", ...shadows.card,
  },
  churchLogo: { width: 60, height: 64, backgroundColor: colors.oliveFaint },
  churchIconWrap: { width: 60, height: 64, alignItems: "center", justifyContent: "center", backgroundColor: colors.oliveFaint },
  churchBody: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  churchName: { ...typography.subtitle, color: colors.ink },
  churchDesc: { fontSize: 13, color: colors.inkFaint, marginTop: 3 },

  // Confirm
  confirmCard: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  confirmLogo: { width: 80, height: 80, borderRadius: radii.lg, marginBottom: 16 },
  confirmChurchName: { fontSize: 22, fontWeight: "700", color: colors.ink, textAlign: "center", marginBottom: 12 },
  confirmQuestion: { ...typography.subtitle, color: colors.ink, textAlign: "center", marginBottom: 10 },
  confirmHint: { fontSize: 13, color: colors.inkSoft, textAlign: "center", marginBottom: 32, lineHeight: 22 },
  confirmBtn: { width: "100%", borderRadius: radii.xl, paddingVertical: spacing.md, alignItems: "center", marginBottom: 12 },
  confirmBtnYes: { backgroundColor: colors.olive },
  confirmBtnNo: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.parchmentDark },
  confirmBtnTextYes: { color: colors.white, fontWeight: "700", fontSize: 16 },
  confirmBtnTextNo: { color: colors.inkSoft, fontWeight: "500", fontSize: 15 },

  // Section layout
  section: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionLabel: { fontSize: 10, fontWeight: "600", color: colors.inkFaint, letterSpacing: 2, marginBottom: 12 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#4CAF50", marginBottom: 12 },

  // Today's bulletin
  todayCard: { borderRadius: radii.xl, overflow: "hidden", ...shadows.cardLg, marginBottom: 0 },
  todayGrad: { padding: spacing.lg, minHeight: 180 },
  decor1: {
    position: "absolute", right: -30, top: -30, width: 130, height: 130,
    borderRadius: 65, backgroundColor: "rgba(255,255,255,0.04)",
  },
  decor2: {
    position: "absolute", right: 30, bottom: -20, width: 80, height: 80,
    borderRadius: 40, backgroundColor: "rgba(255,255,255,0.03)",
  },
  todayRow: { flexDirection: "row", gap: spacing.md, flex: 1 },
  todayFreqRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  todayFreq: { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.45)", letterSpacing: 2 },
  todayTitle: { fontSize: 20, fontWeight: "700", color: colors.white, lineHeight: 26, marginBottom: 8 },
  todayPreview: { fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 20 },
  paidBadge: { backgroundColor: colors.gold, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill },
  paidBadgeText: { fontSize: 10, fontWeight: "700", color: colors.ink },
  todayFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg },
  todayDate: { fontSize: 12, color: "rgba(255,255,255,0.45)" },
  readMore: { color: "#E2C060", fontWeight: "600", fontSize: 13 },

  noBulletinCard: {
    backgroundColor: colors.white, borderRadius: radii.xl, padding: spacing.xl,
    alignItems: "center", ...shadows.card, marginBottom: spacing.md,
  },
  noBulletinTitle: { ...typography.subtitle, color: colors.ink, marginBottom: 8 },
  noBulletinDesc: { fontSize: 13, color: colors.inkSoft, textAlign: "center", lineHeight: 22 },

  // Archive
  archiveHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  showAll: { color: colors.olive, fontWeight: "600", fontSize: 13 },
  noArchive: { fontSize: 13, color: colors.inkFaint, textAlign: "center", paddingVertical: spacing.lg },
  archiveCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.white,
    borderRadius: radii.lg, padding: spacing.md, overflow: "hidden",
    ...shadows.subtle, marginBottom: spacing.xs,
  },
  archiveGradAccent: {
    position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
    borderTopLeftRadius: radii.lg, borderBottomLeftRadius: radii.lg,
  },
  archiveTitle: { fontSize: 14, fontWeight: "600", color: colors.ink, marginBottom: 3 },
  archiveMeta: { fontSize: 12, color: colors.inkFaint },
  archivePaid: { fontSize: 12, fontWeight: "700", color: colors.gold, marginRight: 8 },
  archiveArrow: { fontSize: 20, color: colors.oliveFaint, fontWeight: "300" },

  // Social links
  socialRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: 4 },
  socialLinkBtn: {
    backgroundColor: colors.white, borderRadius: radii.lg,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.parchmentDark, ...shadows.subtle,
  },
  socialLinkText: { fontSize: 13, fontWeight: "600", color: colors.ink },

  // Explore
  exploreRow: { flexDirection: "row", gap: spacing.md },
  exploreBtn: {
    flex: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.white, borderRadius: radii.xl,
    paddingVertical: spacing.lg, ...shadows.card,
  },
  exploreBtnLabel: { fontSize: 13, fontWeight: "600", color: colors.olive },

  // Modal
  modalHeader: { paddingTop: 52, paddingBottom: 20, paddingHorizontal: spacing.lg },
  modalTitle: { fontSize: 20, fontWeight: "700", color: colors.white, marginTop: 8, marginBottom: 4 },
  modalMeta: { fontSize: 12, color: "rgba(255,255,255,0.5)" },

  // Paywall
  paywallBox: { alignItems: "center", padding: spacing.xl },
  paywallTitle: { ...typography.title, color: colors.ink, marginBottom: 12 },
  paywallDesc: { ...typography.body, color: colors.inkSoft, textAlign: "center", lineHeight: 26, marginBottom: 32 },
  payBtn: {
    backgroundColor: colors.olive, borderRadius: radii.xl,
    paddingVertical: spacing.md, paddingHorizontal: spacing.xl, alignItems: "center",
  },
  payBtnText: { color: colors.white, fontWeight: "700", fontSize: 16 },

  pressed: { opacity: 0.88, transform: [{ scale: 0.975 }] },
});
