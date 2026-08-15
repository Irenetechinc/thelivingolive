/**
 * StoriesRow — horizontal strip of 24-h stories at the top of the Feed.
 * Shows own story first ("Your Story"), then active stories from everyone else.
 * Unseen stories get a gold ring; seen stories get a muted ring.
 */
import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, shadows } from '../../theme/theme';
import type { Story } from '../../lib/communityApi';

type Props = {
  stories: Story[];
  myUserId: string | null;
  myAvatarUrl: string | null;
  myName: string;
  onAddStory: () => void;
  onViewStory: (index: number) => void;
  loading?: boolean;
};

// Group stories by user (so each user is one circle with "N" if multiple)
type StoryGroup = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  stories: Story[];
  hasUnseen: boolean;
  isOwn: boolean;
};

export default function StoriesRow({
  stories, myUserId, myAvatarUrl, myName, onAddStory, onViewStory, loading,
}: Props) {
  // Build groups: own story(s) first, then others
  const groups = React.useMemo<StoryGroup[]>(() => {
    const map = new Map<string, StoryGroup>();
    for (const s of stories) {
      if (!map.has(s.userId)) {
        map.set(s.userId, {
          userId: s.userId,
          name: s.authorName,
          avatarUrl: s.authorAvatarUrl,
          stories: [],
          hasUnseen: false,
          isOwn: s.userId === myUserId,
        });
      }
      const g = map.get(s.userId)!;
      g.stories.push(s);
      if (!s.seenByMe) g.hasUnseen = true;
    }
    const own = myUserId ? map.get(myUserId) ?? null : null;
    const others = [...map.values()].filter(g => g.userId !== myUserId);
    return own ? [own, ...others] : others;
  }, [stories, myUserId]);

  // Map group index → flat story index for the viewer
  const flatIndexMap = React.useMemo(() => {
    let offset = 0;
    const result: number[] = [];
    for (const g of groups) {
      result.push(offset);
      offset += g.stories.length;
    }
    return result;
  }, [groups]);

  return (
    <View style={s.wrap}>
      <FlatList
        data={groups}
        horizontal
        keyExtractor={g => g.userId}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          /* Always show the "Add your story" button */
          <Pressable style={s.item} onPress={onAddStory}>
            <View style={[s.ring, s.ringAdd]}>
              {myAvatarUrl
                ? <Image source={{ uri: myAvatarUrl }} style={s.avatar} />
                : <View style={[s.avatar, s.avatarPlaceholder]}>
                    <Text style={s.initials}>{(myName ?? '?').slice(0, 1).toUpperCase()}</Text>
                  </View>}
              <View style={s.addBadge}>
                <Ionicons name="add" size={12} color="#fff" />
              </View>
            </View>
            <Text style={s.label} numberOfLines={1}>Your Story</Text>
          </Pressable>
        }
        renderItem={({ item: g, index }) => (
          <Pressable
            style={s.item}
            onPress={() => onViewStory(flatIndexMap[index])}
          >
            <View style={[s.ring, g.hasUnseen ? s.ringUnseen : s.ringSeen]}>
              {g.stories[0]?.mediaUrl
                ? <Image 
                    source={{ uri: g.stories[0].mediaUrl }} 
                    style={s.avatar}
                    resizeMode="cover"
                  />
                : g.avatarUrl
                  ? <Image source={{ uri: g.avatarUrl }} style={s.avatar} />
                  : <View style={[s.avatar, s.avatarPlaceholder]}>
                      <Text style={s.initials}>{(g.name ?? '?').slice(0, 1).toUpperCase()}</Text>
                    </View>}
            </View>
            <Text style={s.label} numberOfLines={1}>{g.name.split(' ')[0]}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator size="small" color={colors.olive} />
            </View>
          ) : null
        }
      />
    </View>
  );
}

const CIRCLE = 64;
const s = StyleSheet.create({
  wrap: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.parchmentDark,
    paddingVertical: spacing.sm,
  },
  list: { paddingHorizontal: spacing.md, gap: spacing.md },
  item: { alignItems: 'center', width: CIRCLE + 8, gap: 4 },
  ring: {
    width: CIRCLE + 4,
    height: CIRCLE + 4,
    borderRadius: (CIRCLE + 4) / 2,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ringAdd: { borderColor: colors.parchmentDark, borderStyle: 'dashed' },
  ringUnseen: { borderColor: colors.gold },
  ringSeen: { borderColor: colors.parchmentDark },
  avatar: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: colors.parchmentDark,
  },
  avatarPlaceholder: {
    backgroundColor: colors.olive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: '#fff', fontSize: 22, fontWeight: '700' },
  addBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.olive,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  label: {
    fontSize: 11,
    color: colors.inkSoft,
    fontWeight: '500',
    maxWidth: CIRCLE + 8,
    textAlign: 'center',
  },
  loadingWrap: { width: 80, alignItems: 'center', justifyContent: 'center' },
});
