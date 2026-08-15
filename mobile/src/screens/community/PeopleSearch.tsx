/**
 * PeopleSearch — full-screen search modal for finding community members.
 * Search by display name or @username. Tap a result to view their profile.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput, FlatList,
  Pressable, Image, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography, shadows } from '../../theme/theme';
import {
  searchUsers, sendConnectionRequest, getConnectionStatus,
  type UserProfile, type Connection,
} from '../../lib/communityApi';

type Props = {
  visible: boolean;
  myUserId: string | null;
  onClose: () => void;
  onViewProfile: (userId: string) => void;
};

export default function PeopleSearch({ visible, myUserId, onClose, onViewProfile }: Props) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [connections, setConnections] = useState<Record<string, Connection | null>>({});
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setResults([]);
      setConnections({});
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [visible]);

  useEffect(() => {
    if (!results.length) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        results.map(async (u) => {
          if (u.id === myUserId) return [u.id, null] as const;
          try {
            const status = await getConnectionStatus(u.id);
            return [u.id, status] as const;
          } catch {
            return [u.id, null] as const;
          }
        })
      );
      if (cancelled) return;
      const next = Object.fromEntries(entries.filter(([, v]) => v));
      setConnections(prev => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [results, myUserId]);

  function onChangeText(text: string) {
    setQuery(text);
    if (debounce.current) clearTimeout(debounce.current);
    if (!text.trim()) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchUsers(text.trim());
        // Self is a valid search result: opening it uses the normal self
        // profile tab semantics instead of hiding the account from its owner.
        setResults(res);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  }

  async function handleConnect(userId: string) {
    try {
      const c = await sendConnectionRequest(userId);
      setConnections(prev => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          id: c.id || prev[userId]?.id || '',
          userId,
          name: c.name || prev[userId]?.name || 'Member',
          avatarUrl: c.avatarUrl ?? prev[userId]?.avatarUrl ?? null,
          status: c.status || 'pending',
          requesterId: c.requesterId,
          createdAt: c.createdAt,
        },
      }));
    } catch {
      // silent
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[ps.container, { paddingTop: insets.top + 8 }]}>
          {/* Search bar row */}
          <View style={ps.searchRow}>
            <View style={ps.searchBar}>
              <Ionicons name="search" size={18} color={colors.inkFaint} />
              <TextInput
                ref={inputRef}
                style={ps.searchInput}
                placeholder="Search by name or @username…"
                placeholderTextColor={colors.inkFaint}
                value={query}
                onChangeText={onChangeText}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {loading && <ActivityIndicator size="small" color={colors.olive} />}
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={{ paddingLeft: spacing.sm }}>
              <Text style={ps.cancelText}>Cancel</Text>
            </Pressable>
          </View>

          <FlatList
            data={results}
            keyExtractor={u => u.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: u }) => {
              const conn = connections[u.id];
              const isPending = conn?.status === 'pending';
              const isConnected = conn?.status === 'accepted';
              return (
                <Pressable
                  style={({ pressed }) => [ps.row, pressed && { backgroundColor: colors.parchment }]}
                  onPress={() => { onClose(); onViewProfile(u.id); }}
                >
                  {u.avatarUrl
                    ? <Image source={{ uri: u.avatarUrl }} style={ps.avatar} />
                    : <View style={[ps.avatar, ps.avatarPlaceholder]}>
                        <Text style={ps.avatarInitial}>{(u.displayName ?? '?').slice(0, 1).toUpperCase()}</Text>
                      </View>}
                  <View style={{ flex: 1 }}>
                    <Text style={ps.name}>{u.displayName ?? 'Member'}</Text>
                    {u.username ? <Text style={ps.username}>@{u.username}</Text> : null}
                    {u.churchAffiliation ? (
                      <Text style={ps.sub} numberOfLines={1}>
                        <Ionicons name="business-outline" size={11} color={colors.inkFaint} /> {u.churchAffiliation}
                      </Text>
                    ) : null}
                  </View>
                  {u.id === myUserId ? (
                    <View style={ps.youChip}>
                      <Text style={ps.youText}>You</Text>
                    </View>
                  ) : !isConnected && !isPending ? (
                    <Pressable
                      style={ps.connectBtn}
                      onPress={(event) => {
                        event?.stopPropagation?.();
                        handleConnect(u.id);
                      }}
                    >
                      <Ionicons name="person-add-outline" size={14} color={colors.olive} />
                      <Text style={ps.connectBtnText}>Connect</Text>
                    </Pressable>
                  ) : isPending ? (
                    <View style={ps.pendingChip}>
                      <Text style={ps.pendingText}>Pending</Text>
                    </View>
                  ) : (
                    <View style={ps.connectedChip}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.olive} />
                      <Text style={ps.connectedText}>Connected</Text>
                    </View>
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              !loading && query.length > 0 ? (
                <View style={ps.empty}>
                  <Ionicons name="search-outline" size={48} color={colors.inkFaint} />
                  <Text style={ps.emptyTitle}>No results for "{query}"</Text>
                  <Text style={ps.emptySub}>Try a different name or username</Text>
                </View>
              ) : !loading && query.length === 0 ? (
                <View style={ps.empty}>
                  <Ionicons name="people-outline" size={48} color={colors.inkFaint} />
                  <Text style={ps.emptyTitle}>Find people</Text>
                  <Text style={ps.emptySub}>Search by display name or @username</Text>
                </View>
              ) : null
            }
            contentContainerStyle={{ paddingBottom: 80 }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ps = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.parchmentDark },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.parchment, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: colors.ink },
  cancelText: { fontSize: 15, color: colors.olive, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.parchment },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.parchmentDark },
  avatarPlaceholder: { backgroundColor: colors.olive, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 18, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  username: { fontSize: 12, color: colors.inkFaint, marginTop: 1 },
  sub: { fontSize: 12, color: colors.inkFaint, marginTop: 2 },
  connectBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.olive },
  connectBtnText: { fontSize: 12, fontWeight: '600', color: colors.olive },
  pendingChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, backgroundColor: colors.parchment },
  pendingText: { fontSize: 12, color: colors.inkFaint, fontWeight: '500' },
  connectedChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radii.pill, backgroundColor: '#EDF7E8' },
  connectedText: { fontSize: 12, color: colors.olive, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xl, gap: 8 },
  emptyTitle: { ...typography.subtitle, color: colors.ink },
  emptySub: { fontSize: 14, color: colors.inkSoft, textAlign: 'center' },
  youChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, backgroundColor: colors.parchment, alignItems: 'center', justifyContent: 'center' },
  youText: { fontSize: 12, color: colors.inkFaint, fontWeight: '600' },
});
