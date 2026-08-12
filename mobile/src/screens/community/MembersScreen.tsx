/**
 * MembersScreen — list of church members to start a DM with.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Image, ActivityIndicator, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radii, spacing, typography, shadows } from '../../theme/theme';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import { getChurchMembers, getOrCreateDM, type Author } from '../../lib/communityApi';

type Props = NativeStackScreenProps<RootStackParamList, 'CommunityMembers'>;

function Avatar({ url, name, size = 44 }: { url: string | null; name: string; size?: number }) {
  const initials = (name ?? '?').slice(0, 2).toUpperCase();
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.parchmentDark }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.olive, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: size * 0.36, fontWeight: '700' }}>{initials}</Text>
    </View>
  );
}

export default function MembersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [members, setMembers] = useState<Author[]>([]);
  const [filtered, setFiltered] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [startingDm, setStartingDm] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: 'New Message', headerShown: true });
    getChurchMembers()
      .then(m => { setMembers(m); setFiltered(m); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function search(q: string) {
    setQuery(q);
    const lower = q.toLowerCase();
    setFiltered(q ? members.filter(m => m.name.toLowerCase().includes(lower)) : members);
  }

  async function startDM(member: Author) {
    setStartingDm(member.userId);
    try {
      const roomId = await getOrCreateDM(member.userId);
      navigation.replace('ChatRoom' as any, { roomId, roomName: member.name });
    } catch (e: any) {
      setStartingDm(null);
    }
  }

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.parchment, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.gold} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.parchment }}>
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={search}
          placeholder="Search members…"
          placeholderTextColor={colors.inkFaint}
          clearButtonMode="while-editing"
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={m => m.userId}
        renderItem={({ item: m }) => (
          <Pressable
            style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.parchment }]}
            onPress={() => startDM(m)}
            disabled={startingDm === m.userId}
          >
            <Avatar url={m.avatarUrl} name={m.name} />
            <Text style={s.name}>{m.name}</Text>
            {startingDm === m.userId
              ? <ActivityIndicator size="small" color={colors.olive} />
              : <Text style={s.arrow}>›</Text>}
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>👥</Text>
            <Text style={s.emptyText}>{query ? 'No members match your search.' : 'No other members in your church yet.'}</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  searchWrap: { backgroundColor: colors.white, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.parchmentDark },
  searchInput: { backgroundColor: colors.parchment, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingHorizontal: spacing.lg, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.parchmentDark },
  name: { flex: 1, ...typography.subtitle, color: colors.ink, fontSize: 15 },
  arrow: { fontSize: 22, color: colors.inkFaint, fontWeight: '300' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.inkFaint, textAlign: 'center', paddingHorizontal: 40 },
});
