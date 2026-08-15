import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { colors, radii, spacing, typography } from '../../theme/theme';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import { getConnectionRequests, respondToConnection, type Connection } from '../../lib/communityApi';

type Props = NativeStackScreenProps<RootStackParamList, 'ConnectionRequests'>;

export default function ConnectionRequestsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    try {
      const data = await getConnectionRequests();
      setRequests(data.filter((r) => r.status === 'pending'));
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadRequests();
    }, [loadRequests])
  );

  navigation.setOptions({
    title: 'Connection Requests',
    headerRight: () => (
      <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
        <Ionicons name="close" size={22} color={colors.white} />
      </Pressable>
    ),
  });

  async function handleRespond(id: string, action: 'accept' | 'decline' | 'block') {
    setRespondingId(id);
    try {
      await respondToConnection(id, action);
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch {
      Alert.alert('Connection update failed', 'Please try again.');
    } finally {
      setRespondingId(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.olive} size="small" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {requests.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={52} color={colors.inkFaint} />
          <Text style={styles.emptyTitle}>No pending requests</Text>
          <Text style={styles.emptyText}>When someone wants to connect, you can accept or decline here.</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => {
            const busy = respondingId === item.id;
            return (
              <View style={styles.row}>
                <View style={styles.avatarWrap}>
                  {item.avatarUrl ? (
                    <View style={[styles.avatar, { backgroundColor: colors.parchmentDark }]} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarText}>{(item.name ?? 'M').slice(0, 1).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.info}>
                  <Text style={styles.name}>{item.name || 'Member'}</Text>
                  <Text style={styles.sub}>Would like to connect</Text>
                </View>
                {busy ? (
                  <ActivityIndicator size="small" color={colors.olive} />
                ) : (
                  <View style={styles.actions}>
                    <Pressable style={[styles.action, styles.accept]} onPress={() => handleRespond(item.id, 'accept')}>
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <Text style={styles.acceptText}>Accept</Text>
                    </Pressable>
                    <Pressable style={[styles.action, styles.decline]} onPress={() => handleRespond(item.id, 'decline')}>
                      <Text style={styles.declineText}>Decline</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.parchment },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  emptyTitle: { ...typography.subtitle, color: colors.ink, marginTop: spacing.md },
  emptyText: { marginTop: spacing.sm, fontSize: 14, color: colors.inkSoft, textAlign: 'center', lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.parchmentDark,
  },
  avatarWrap: { width: 44, height: 44 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { backgroundColor: colors.olive, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: radii.pill },
  accept: { backgroundColor: colors.olive },
  acceptText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  decline: { backgroundColor: colors.parchment, borderWidth: 1, borderColor: colors.parchmentDark },
  declineText: { color: colors.inkSoft, fontWeight: '600', fontSize: 12 },
});
