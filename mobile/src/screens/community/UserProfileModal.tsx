/**
 * UserProfileModal — full-screen modal for viewing another user's profile.
 * Shows avatar, cover, extended fields, connection status, and their recent posts.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, Image, ScrollView,
  ActivityIndicator, Alert, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii, spacing, typography, shadows } from '../../theme/theme';
import {
  getUserProfile, getConnectionStatus, sendConnectionRequest,
  removeConnection, getUserPosts,
  type UserProfile, type Connection, type CommunityPost,
} from '../../lib/communityApi';

type Props = {
  userId: string | null;
  myUserId: string | null;
  visible: boolean;
  onClose: () => void;
  onStartDM?: (userId: string) => void;
};

export default function UserProfileModal({ userId, myUserId, visible, onClose, onStartDM }: Props) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (!visible || !userId) return;
    setLoading(true);
    setProfile(null);
    setConnection(null);
    setPosts([]);

    Promise.all([
      getUserProfile(userId),
      userId !== myUserId ? getConnectionStatus(userId) : Promise.resolve(null),
      getUserPosts(userId),
    ]).then(([p, c, pp]) => {
      setProfile(p);
      setConnection(c);
      setPosts(pp.slice(0, 12));
    }).catch(() => {
      // show error state
    }).finally(() => setLoading(false));
  }, [visible, userId]);

  async function handleConnect() {
    if (!userId) return;
    if (connection?.status === 'accepted') {
      // Disconnect
      Alert.alert('Remove Connection', `Remove ${profile?.displayName ?? 'this user'} from your connections?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: async () => {
            setActionBusy(true);
            try {
              await removeConnection(connection.id);
              setConnection(null);
            } catch { Alert.alert('Error', 'Could not remove connection.'); }
            finally { setActionBusy(false); }
          },
        },
      ]);
      return;
    }
    if (connection?.status === 'pending') return; // already pending

    setActionBusy(true);
    try {
      const c = await sendConnectionRequest(userId);
      setConnection(c);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not send connection request.');
    } finally {
      setActionBusy(false);
    }
  }

  const isOwnProfile = userId === myUserId;
  const connLabel = !connection ? 'Connect' : connection.status === 'accepted' ? 'Connected' : connection.status === 'pending' ? 'Pending…' : 'Connect';
  const connIcon = !connection ? 'person-add-outline' : connection.status === 'accepted' ? 'checkmark-circle-outline' : 'hourglass-outline';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[up.container, { paddingBottom: insets.bottom }]}>
        {/* Header bar */}
        <View style={up.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="chevron-down" size={26} color={colors.inkSoft} />
          </Pressable>
        </View>

        {loading ? (
          <View style={up.loadingWrap}>
            <ActivityIndicator size="large" color={colors.olive} />
          </View>
        ) : !profile ? (
          <View style={up.loadingWrap}>
            <Text style={{ color: colors.inkSoft }}>Could not load profile.</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
            {/* Cover */}
            <View style={up.cover}>
              {profile.coverUrl
                ? <Image source={{ uri: profile.coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                : <LinearGradient colors={['#3E4A2F', '#8A6A10']} style={StyleSheet.absoluteFill} />}
            </View>

            {/* Avatar + action row */}
            <View style={up.avatarRow}>
              <View style={up.avatarWrap}>
                {profile.avatarUrl
                  ? <Image source={{ uri: profile.avatarUrl }} style={{ width: 80, height: 80, borderRadius: 40 }} />
                  : <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.olive, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700' }}>{(profile.displayName ?? '?').slice(0, 1).toUpperCase()}</Text>
                    </View>}
              </View>

              {!isOwnProfile && (
                <View style={up.actionRow}>
                  <Pressable
                    style={[up.actionBtn, connection?.status === 'accepted' && up.actionBtnActive]}
                    onPress={handleConnect}
                    disabled={actionBusy}
                  >
                    {actionBusy
                      ? <ActivityIndicator size="small" color={connection?.status === 'accepted' ? '#fff' : colors.olive} />
                      : <>
                          <Ionicons name={connIcon as any} size={16} color={connection?.status === 'accepted' ? '#fff' : colors.olive} />
                          <Text style={[up.actionBtnText, connection?.status === 'accepted' && { color: '#fff' }]}>{connLabel}</Text>
                        </>}
                  </Pressable>
                  {onStartDM && (
                    <Pressable style={up.actionBtnSecondary} onPress={() => { onClose(); onStartDM(userId!); }}>
                      <Ionicons name="chatbubble-outline" size={16} color={colors.oliveDark} />
                      <Text style={up.actionBtnSecondaryText}>Message</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            {/* Name + username */}
            <View style={up.infoBlock}>
              <Text style={up.displayName}>{profile.displayName ?? 'Member'}</Text>
              {profile.username ? <Text style={up.username}>@{profile.username}</Text> : null}
              {profile.bio ? <Text style={up.bio}>{profile.bio}</Text> : null}

              {/* Stats row */}
              <View style={up.statsRow}>
                <View style={up.statChip}>
                  <Text style={up.statNum}>{profile.connectionCount ?? 0}</Text>
                  <Text style={up.statLabel}>Connections</Text>
                </View>
                <View style={up.statChip}>
                  <Text style={up.statNum}>{posts.length}</Text>
                  <Text style={up.statLabel}>Posts</Text>
                </View>
              </View>

              {/* Detail rows */}
              {profile.churchAffiliation ? <DetailRow icon="business-outline" text={profile.churchAffiliation} /> : null}
              {profile.location || profile.state || profile.country ? (
                <DetailRow icon="location-outline" text={[profile.location, profile.state, profile.country].filter(Boolean).join(', ')} />
              ) : null}
              {profile.education ? <DetailRow icon="school-outline" text={profile.education} /> : null}
              {profile.website ? <DetailRow icon="globe-outline" text={profile.website} /> : null}
              {profile.gender ? <DetailRow icon="person-outline" text={profile.gender} /> : null}
              {profile.dobPublic && profile.dateOfBirth ? (
                <DetailRow icon="calendar-outline" text={profile.dateOfBirth} />
              ) : null}
            </View>

            {/* Posts grid */}
            {posts.length > 0 && (
              <View style={up.postsSection}>
                <Text style={up.sectionTitle}>POSTS</Text>
                <View style={up.postsGrid}>
                  {posts.map(p => (
                    <View key={p.id} style={up.postCell}>
                      {p.imageUrl
                        ? <Image source={{ uri: p.imageUrl }} style={up.postThumb} resizeMode="cover" />
                        : <View style={[up.postThumb, { backgroundColor: colors.parchmentDark, padding: 6 }]}>
                            <Text style={{ fontSize: 11, color: colors.inkSoft }} numberOfLines={4}>{p.body}</Text>
                          </View>}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function DetailRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={up.detailRow}>
      <Ionicons name={icon as any} size={15} color={colors.inkFaint} />
      <Text style={up.detailText}>{text}</Text>
    </View>
  );
}

const CELL = (require('react-native').Dimensions.get('window').width - spacing.lg * 2 - 4) / 3;
const up = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 4 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cover: { height: 150, backgroundColor: colors.oliveDark, overflow: 'hidden' },
  avatarRow: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, marginTop: -40, marginBottom: spacing.sm,
  },
  avatarWrap: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: colors.white, backgroundColor: colors.white, ...shadows.card },
  actionRow: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'flex-end' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.olive },
  actionBtnActive: { backgroundColor: colors.olive, borderColor: colors.olive },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: colors.olive },
  actionBtnSecondary: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.oliveDark },
  actionBtnSecondaryText: { fontSize: 13, fontWeight: '600', color: colors.oliveDark },
  infoBlock: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, backgroundColor: colors.white },
  displayName: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.3, marginBottom: 2 },
  username: { fontSize: 14, color: colors.inkFaint, marginBottom: 6 },
  bio: { fontSize: 14, color: colors.inkSoft, lineHeight: 20, marginBottom: 10 },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md, marginTop: spacing.sm },
  statChip: { alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '700', color: colors.ink },
  statLabel: { fontSize: 11, color: colors.inkFaint, marginTop: 1 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 5 },
  detailText: { fontSize: 13, color: colors.inkSoft },
  postsSection: { paddingHorizontal: spacing.lg },
  sectionTitle: { ...typography.micro, color: colors.inkFaint, letterSpacing: 2, marginBottom: spacing.sm },
  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  postCell: { width: CELL, height: CELL },
  postThumb: { width: '100%', height: '100%', borderRadius: 4, overflow: 'hidden', backgroundColor: colors.parchmentDark },
});
