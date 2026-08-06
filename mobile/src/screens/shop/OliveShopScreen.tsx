/**
 * OliveShopScreen — Olive Shop church marketplace.
 *
 * Features:
 *  - Animated splash screen with recursive expanding ring animations
 *  - Church selection prompt if user hasn't joined a church in Bulletin
 *  - Products scoped to user's home church (only members see their church's items)
 *  - Products laid out in horizontal rows per category (more rows than columns)
 *  - Product detail sheet with buy / get-free flow
 *  - Flutterwave payment via Linking.openURL (same as DonateScreen)
 *  - My Orders view with download support for digital/media products
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal,
  ScrollView, ActivityIndicator, Image, TextInput, Linking,
  Alert, Animated, TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  getMyShopChurch, getAllChurches, getShopCategories, getShopProducts,
  getMyOrders, initiateShopOrder, verifyShopOrder, getDownloadLink,
  type ShopChurch, type ShopCategory, type ShopProduct, type ShopOrder,
} from '../../lib/shopApi';
import { colors, radii, spacing, typography, shadows } from '../../theme/theme';

// ── Shop colour tokens (warm amber, distinct from main olive palette) ─────────
const S = {
  dark:      '#2B1800',
  mid:       '#5C3A1E',
  gold:      '#C4860A',
  goldLight: '#F5D680',
  amber:     '#E9A825',
  cream:     '#FBF4E8',
  parchment: '#F2E8D5',
  ring:      'rgba(196,134,10,0.45)',
};

// ── Recursive pulsing ring (splash animation) ─────────────────────────────────
function PulsingRing({ size, delay }: { size: number; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const scale   = anim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 2.2] });
  const opacity = anim.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 0.7, 0.3, 0] });

  return (
    <Animated.View style={{
      position: 'absolute',
      width: size, height: size, borderRadius: size / 2,
      borderWidth: 1.5, borderColor: S.ring,
      opacity, transform: [{ scale }],
    }} />
  );
}

// ── Animated splash (2.5 s) ───────────────────────────────────────────────────
function ShopSplash({ onDone }: { onDone: () => void }) {
  const logoAnim = useRef(new Animated.Value(0)).current;
  const titleAnim = useRef(new Animated.Value(0)).current;
  const tagAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Staggered entrance: logo → title → tagline
    Animated.stagger(260, [
      Animated.spring(logoAnim,  { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
      Animated.timing(titleAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(tagAnim,   { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <LinearGradient colors={[S.dark, '#4A2A0A', S.mid]} style={spl.fill}>
      {/* Recursive expanding rings — 3 rings staggered by 600 ms */}
      <PulsingRing size={200} delay={0} />
      <PulsingRing size={200} delay={600} />
      <PulsingRing size={200} delay={1200} />

      <Animated.Text style={[spl.logo, {
        opacity: logoAnim,
        transform: [{ scale: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
      }]}>🛍</Animated.Text>

      <Animated.Text style={[spl.title, { opacity: titleAnim,
        transform: [{ translateY: titleAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }]}>OLIVE SHOP</Animated.Text>

      <Animated.Text style={[spl.tag, { opacity: tagAnim }]}>
        Your Church Marketplace
      </Animated.Text>
    </LinearGradient>
  );
}
const spl = StyleSheet.create({
  fill:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo:  { fontSize: 72, marginBottom: 12 },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: 5, color: S.goldLight, marginBottom: 8 },
  tag:   { fontSize: 13, color: 'rgba(245,214,128,0.7)', letterSpacing: 1 },
});

// ── Church select modal ───────────────────────────────────────────────────────
function ChurchSelectModal({ visible, onSelect, onClose }: {
  visible: boolean;
  onSelect: (c: ShopChurch) => void;
  onClose: () => void;
}) {
  const [churches, setChurches] = useState<ShopChurch[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    getAllChurches().then(setChurches).catch(() => {}).finally(() => setLoading(false));
  }, [visible]);

  const filtered = churches.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: S.cream }}>
        <LinearGradient colors={[S.dark, S.mid]} style={cs.header}>
          <Text style={cs.headerTitle}>Choose Your Church</Text>
          <Text style={cs.headerSub}>Shop products from your church community</Text>
        </LinearGradient>
        <View style={cs.searchRow}>
          <TextInput
            style={cs.search} value={search} onChangeText={setSearch}
            placeholder="Search churches…" placeholderTextColor={colors.inkFaint}
          />
        </View>
        {loading ? <ActivityIndicator color={S.gold} style={{ marginTop: 40 }} /> : (
          <FlatList
            data={filtered} keyExtractor={c => c.id}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
            renderItem={({ item: c }) => (
              <Pressable style={cs.row} onPress={() => onSelect(c)}>
                {c.logo_url
                  ? <Image source={{ uri: c.logo_url }} style={cs.logo} />
                  : <View style={[cs.logo, { backgroundColor: S.mid, alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ fontSize: 20 }}>⛪</Text>
                    </View>}
                <View style={{ flex: 1 }}>
                  <Text style={cs.churchName}>{c.name}</Text>
                  {c.description ? <Text style={cs.churchDesc} numberOfLines={1}>{c.description}</Text> : null}
                </View>
                <Text style={cs.arrow}>›</Text>
              </Pressable>
            )}
          />
        )}
        <Pressable style={cs.cancelBtn} onPress={onClose}>
          <Text style={cs.cancelText}>Browse later</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
const cs = StyleSheet.create({
  header: { paddingTop: 24, paddingBottom: 20, paddingHorizontal: spacing.lg },
  headerTitle: { fontSize: 22, fontWeight: '800', color: S.goldLight, letterSpacing: 0.5 },
  headerSub: { fontSize: 13, color: 'rgba(245,214,128,0.7)', marginTop: 4 },
  searchRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: S.cream },
  search: { backgroundColor: '#fff', borderRadius: radii.md, padding: spacing.md, fontSize: 14, color: colors.ink, borderWidth: 1, borderColor: colors.parchmentDark },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.subtle, gap: spacing.sm },
  logo: { width: 44, height: 44, borderRadius: 22 },
  churchName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  churchDesc: { fontSize: 12, color: colors.inkFaint, marginTop: 2 },
  arrow: { fontSize: 20, color: colors.inkFaint },
  cancelBtn: { margin: spacing.lg, padding: spacing.md, alignItems: 'center' },
  cancelText: { color: colors.inkSoft, fontSize: 14 },
});

// ── Product card ──────────────────────────────────────────────────────────────
function ProductCard({ product, onPress, delay = 0 }: {
  product: ShopProduct; onPress: () => void; delay?: number;
}) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(fadeAnim, { toValue: 1, tension: 70, friction: 10,
      delay, useNativeDriver: true }).start();
  }, []);

  function handlePressIn() {
    Animated.spring(scaleAnim, { toValue: 0.95, tension: 200, friction: 10, useNativeDriver: true }).start();
  }
  function handlePressOut() {
    Animated.spring(scaleAnim, { toValue: 1, tension: 200, friction: 10, useNativeDriver: true }).start();
  }

  const priceLabel = product.is_free
    ? 'FREE'
    : `${product.currency === 'NGN' ? '₦' : product.currency}${Number(product.price).toLocaleString()}`;

  const typeIcon = { physical: '📦', digital: '📱', media: '🎵' }[product.product_type] ?? '📦';

  return (
    <Animated.View style={{
      opacity: fadeAnim,
      transform: [{ scale: scaleAnim }, {
        translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
      }],
    }}>
      <Pressable style={pc.card} onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <View style={pc.imageWrap}>
          {product.thumbnail_url
            ? <Image source={{ uri: product.thumbnail_url }} style={pc.image} resizeMode="cover" />
            : <LinearGradient colors={[S.mid, S.dark]} style={pc.image}>
                <Text style={{ fontSize: 40 }}>{typeIcon}</Text>
              </LinearGradient>}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={pc.gradient} />
          <View style={[pc.priceBadge, product.is_free && { backgroundColor: '#2E7D32' }]}>
            <Text style={pc.priceText}>{priceLabel}</Text>
          </View>
          <View style={pc.typeBadge}><Text style={{ fontSize: 10 }}>{typeIcon}</Text></View>
        </View>
        <View style={pc.info}>
          <Text style={pc.title} numberOfLines={2}>{product.title}</Text>
          <Text style={pc.church} numberOfLines={1}>⛪ {product.churchName}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
const pc = StyleSheet.create({
  card: { width: 158, marginRight: spacing.sm, backgroundColor: '#fff', borderRadius: radii.lg, overflow: 'hidden', ...shadows.card },
  imageWrap: { width: '100%', height: 160, position: 'relative', backgroundColor: S.parchment, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  gradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 },
  priceBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: S.gold, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3 },
  priceText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  typeBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 2 },
  info: { padding: spacing.sm },
  title: { fontSize: 13, fontWeight: '700', color: colors.ink, lineHeight: 18, marginBottom: 4 },
  church: { fontSize: 10, color: colors.inkFaint },
});

// ── Category pill ─────────────────────────────────────────────────────────────
function CategoryPill({ cat, isActive, onPress, delay = 0 }: {
  cat: ShopCategory | { id: 'all'; name: string; icon: string; color: string };
  isActive: boolean; onPress: () => void; delay?: number;
}) {
  const slideAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 1, tension: 80, friction: 10, delay, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={{
      opacity: slideAnim,
      transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }],
    }}>
      <Pressable
        style={[pill.base, isActive && { backgroundColor: S.gold, borderColor: S.gold }]}
        onPress={onPress}
      >
        <Text style={{ fontSize: 14 }}>{cat.icon}</Text>
        <Text style={[pill.label, isActive && { color: '#fff', fontWeight: '800' }]}>{cat.name}</Text>
      </Pressable>
    </Animated.View>
  );
}
const pill = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.parchmentDark, backgroundColor: '#fff', marginRight: spacing.sm },
  label: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
});

// ── Category section (header + horizontal product row) ────────────────────────
function CategorySection({ category, products, onProductPress }: {
  category: { name: string; icon: string };
  products: ShopProduct[];
  onProductPress: (p: ShopProduct) => void;
}) {
  if (!products.length) return null;
  return (
    <View style={catsec.wrap}>
      <View style={catsec.header}>
        <Text style={catsec.title}>{category.icon}  {category.name}</Text>
        <Text style={catsec.count}>{products.length} item{products.length !== 1 ? 's' : ''}</Text>
      </View>
      <FlatList
        horizontal showsHorizontalScrollIndicator={false}
        data={products}
        keyExtractor={p => p.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}
        renderItem={({ item, index }) => (
          <ProductCard product={item} delay={index * 60} onPress={() => onProductPress(item)} />
        )}
      />
    </View>
  );
}
const catsec = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  title: { fontSize: 16, fontWeight: '800', color: colors.ink },
  count: { fontSize: 12, color: colors.inkFaint },
});

// ── Product detail sheet ──────────────────────────────────────────────────────
function ProductDetailSheet({ product, onClose, onBuy, onGetFree, loading }: {
  product: ShopProduct; onClose: () => void;
  onBuy: () => void; onGetFree: () => void; loading: boolean;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.04, duration: 700, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
    ])).start();
  }, []);

  const typeLabel = { physical: 'Physical Product', digital: 'Digital Download', media: 'Media / Audio' }[product.product_type];
  const typeIcon  = { physical: '📦', digital: '💾', media: '🎵' }[product.product_type];
  const priceLabel = product.is_free
    ? 'FREE'
    : `${product.currency === 'NGN' ? '₦' : product.currency}${Number(product.price).toLocaleString()}`;

  return (
    <ScrollView style={ds.sheet} contentContainerStyle={ds.sheetContent} showsVerticalScrollIndicator={false}>
      <Pressable style={ds.closeBtn} onPress={onClose}>
        <Text style={ds.closeText}>✕</Text>
      </Pressable>

      {/* Image */}
      <View style={ds.imageWrap}>
        {product.thumbnail_url
          ? <Image source={{ uri: product.thumbnail_url }} style={ds.image} resizeMode="cover" />
          : <LinearGradient colors={[S.mid, S.dark]} style={ds.image}>
              <Text style={{ fontSize: 80 }}>{typeIcon}</Text>
            </LinearGradient>}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.5)']} style={ds.imgGrad} />
        <View style={ds.pricePill}>
          <Text style={ds.priceText}>{priceLabel}</Text>
        </View>
      </View>

      {/* Info */}
      <View style={ds.body}>
        <View style={ds.typeBadge}>
          <Text style={ds.typeIcon}>{typeIcon}</Text>
          <Text style={ds.typeLabel}>{typeLabel}</Text>
        </View>
        <Text style={ds.title}>{product.title}</Text>
        <Text style={ds.church}>⛪ {product.churchName}</Text>
        {product.description ? <Text style={ds.desc}>{product.description}</Text> : null}
        {product.stock_count !== null && (
          <Text style={ds.stock}>
            {product.stock_count > 0 ? `${product.stock_count} in stock` : '⚠️ Out of stock'}
          </Text>
        )}
      </View>

      {/* CTA */}
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Pressable
            style={[ds.buyBtn, (loading || product.stock_count === 0) && { opacity: 0.6 }]}
            onPress={product.is_free ? onGetFree : onBuy}
            disabled={loading || product.stock_count === 0}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={ds.buyText}>
                  {product.is_free ? '🎁 Get for Free' : '💳 Buy Now — ' + priceLabel}
                </Text>}
          </Pressable>
        </Animated.View>
      </View>
    </ScrollView>
  );
}
const ds = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: S.cream },
  sheetContent: { paddingBottom: 40 },
  closeBtn: { position: 'absolute', top: 48, right: 16, zIndex: 99, backgroundColor: 'rgba(0,0,0,0.4)', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 15 },
  imageWrap: { height: 260, backgroundColor: S.parchment, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  image: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  imgGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
  pricePill: { position: 'absolute', bottom: 16, right: 16, backgroundColor: S.gold, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 6 },
  priceText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  body: { padding: spacing.lg },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  typeIcon: { fontSize: 14 },
  typeLabel: { fontSize: 12, color: S.gold, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, lineHeight: 28, marginBottom: 6 },
  church: { fontSize: 13, color: colors.inkFaint, marginBottom: spacing.md },
  desc: { fontSize: 15, color: colors.inkSoft, lineHeight: 23, marginBottom: spacing.md },
  stock: { fontSize: 13, color: colors.inkFaint, fontStyle: 'italic' },
  buyBtn: { backgroundColor: S.gold, borderRadius: radii.xl, paddingVertical: 16, alignItems: 'center', ...shadows.card },
  buyText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

// ── My Orders sheet ───────────────────────────────────────────────────────────
function MyOrdersSheet({ orders, loading, onClose, onDownload, onVerify }: {
  orders: ShopOrder[]; loading: boolean; onClose: () => void;
  onDownload: (o: ShopOrder) => void; onVerify: (o: ShopOrder) => void;
}) {
  const statusColor = (s: string) => ({ paid: '#2E7D32', pending: S.gold, failed: '#C62828', refunded: '#1565C0' }[s] ?? '#666');
  const statusLabel = (s: string) => ({ paid: '✓ Paid', pending: '⏳ Pending', failed: '✕ Failed', refunded: '↩ Refunded' }[s] ?? s);

  return (
    <View style={{ flex: 1, backgroundColor: S.cream }}>
      <LinearGradient colors={[S.dark, S.mid]} style={{ paddingTop: 48, paddingBottom: 16, paddingHorizontal: spacing.lg }}>
        <Pressable onPress={onClose} style={{ alignSelf: 'flex-end', marginBottom: 12 }}>
          <Text style={{ color: S.goldLight, fontSize: 15 }}>✕ Close</Text>
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: '800', color: S.goldLight }}>🛍 My Orders</Text>
      </LinearGradient>
      {loading ? <ActivityIndicator color={S.gold} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={orders} keyExtractor={o => o.id}
          contentContainerStyle={{ padding: spacing.lg }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🛒</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>No orders yet</Text>
              <Text style={{ fontSize: 13, color: colors.inkFaint, marginTop: 6 }}>Items you purchase will appear here.</Text>
            </View>
          }
          renderItem={({ item: o }) => (
            <View style={{ backgroundColor: '#fff', borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.subtle, flexDirection: 'row', gap: spacing.sm }}>
              {o.shop_products?.thumbnail_url
                ? <Image source={{ uri: o.shop_products.thumbnail_url }} style={{ width: 56, height: 56, borderRadius: radii.md, backgroundColor: S.parchment }} />
                : <View style={{ width: 56, height: 56, borderRadius: radii.md, backgroundColor: S.parchment, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 24 }}>🛍</Text>
                  </View>}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 2 }} numberOfLines={1}>
                  {o.shop_products?.title ?? 'Product'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: statusColor(o.status), fontWeight: '700' }}>
                    {statusLabel(o.status)}
                  </Text>
                  {o.amount > 0 && (
                    <Text style={{ fontSize: 11, color: colors.inkFaint }}>
                      · ₦{Number(o.amount).toLocaleString()}
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {o.status === 'pending' && (
                    <Pressable onPress={() => onVerify(o)} style={{ backgroundColor: S.gold, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Verify Payment</Text>
                    </Pressable>
                  )}
                  {o.status === 'paid' && ['digital', 'media'].includes(o.shop_products?.product_type ?? '') && (
                    <Pressable onPress={() => onDownload(o)} style={{ backgroundColor: colors.olive, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>⬇ Download</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Screen
// ═══════════════════════════════════════════════════════════════════════════════
export default function OliveShopScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [splashDone, setSplashDone]     = useState(false);
  const [membership, setMembership]     = useState<{ church_id: string; churches: any } | null>(null);
  const [showChurchSelect, setShowChurchSelect] = useState(false);
  const [categories, setCategories]     = useState<ShopCategory[]>([]);
  const [products, setProducts]         = useState<ShopProduct[]>([]);
  const [selectedCat, setSelectedCat]   = useState<string | null>(null); // null = all
  const [loading, setLoading]           = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);
  const [showDetail, setShowDetail]     = useState(false);
  const [showOrders, setShowOrders]     = useState(false);
  const [orders, setOrders]             = useState<ShopOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [purchasing, setPurchasing]     = useState(false);
  // Physical product delivery
  const [showDelivery, setShowDelivery] = useState(false);
  const [buyerName, setBuyerName]       = useState('');
  const [deliveryAddr, setDeliveryAddr] = useState('');
  const [pendingTxRef, setPendingTxRef] = useState<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  async function loadShop(refresh = false) {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const m = await getMyShopChurch();
      setMembership(m);
      if (!m) { setShowChurchSelect(true); return; }
      const [cats, { products: prods }] = await Promise.all([
        getShopCategories(m.church_id),
        getShopProducts({ churchId: m.church_id }),
      ]);
      setCategories(cats);
      setProducts(prods);
    } catch (e: any) {
      if (!refresh) Alert.alert('Shop Error', e.message ?? 'Could not load shop');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => {
    if (splashDone) loadShop();
  }, [splashDone]));

  // ── Church selected ─────────────────────────────────────────────────────────
  async function handleChurchSelected(church: ShopChurch) {
    setShowChurchSelect(false);
    Alert.alert(
      `${church.name}`,
      'Is this your regular place of worship?',
      [
        { text: 'Just browsing', onPress: () => loadShopForChurch(church, false) },
        { text: 'Yes, set as home', onPress: () => loadShopForChurch(church, true), style: 'default' },
      ]
    );
  }

  async function loadShopForChurch(church: ShopChurch, setAsHome: boolean) {
    try {
      if (setAsHome) {
        await import('../../lib/api').then(m => m.setMyChurch(church.id)).catch(() => {});
      }
      const [cats, { products: prods }] = await Promise.all([
        getShopCategories(church.id).catch(() => []),
        getShopProducts({ churchId: church.id }).catch(() => ({ products: [], churchName: '' })),
      ]);
      setMembership({ church_id: church.id, churches: church });
      setCategories(cats as ShopCategory[]);
      setProducts((prods as any) ?? []);
    } catch {}
  }

  // ── Product flow ────────────────────────────────────────────────────────────
  function openProduct(p: ShopProduct) {
    setSelectedProduct(p);
    setShowDetail(true);
  }

  async function handleBuy() {
    if (!selectedProduct) return;
    if (selectedProduct.product_type === 'physical') {
      setShowDelivery(true);
      return;
    }
    await doPurchase();
  }

  async function handleGetFree() {
    await doPurchase();
  }

  async function doPurchase(addr?: string) {
    if (!selectedProduct) return;
    setPurchasing(true);
    try {
      const result = await initiateShopOrder({
        productId: selectedProduct.id,
        buyerName: buyerName.trim() || undefined,
        deliveryAddress: addr || undefined,
      });
      if (result.free) {
        setShowDetail(false); setShowDelivery(false);
        Alert.alert('🎁 Success', `"${selectedProduct.title}" has been added to your orders!`);
        return;
      }
      if (result.paymentLink) {
        setPendingTxRef(result.txRef ?? null);
        setShowDetail(false); setShowDelivery(false);
        await Linking.openURL(result.paymentLink);
        Alert.alert(
          'Payment Opened',
          'Complete the payment in your browser. Return here and check My Orders to verify.',
          [{ text: 'OK' }]
        );
      }
    } catch (e: any) { Alert.alert('Purchase Error', e.message ?? 'Could not start purchase'); }
    finally { setPurchasing(false); }
  }

  // ── Orders ──────────────────────────────────────────────────────────────────
  async function openOrders() {
    setShowOrders(true);
    setOrdersLoading(true);
    try { setOrders(await getMyOrders()); } catch {}
    finally { setOrdersLoading(false); }
  }

  async function handleVerify(o: ShopOrder) {
    if (!o.flw_tx_ref) return;
    try {
      const { order } = await verifyShopOrder(o.flw_tx_ref);
      if (order.status === 'paid') {
        setOrders(prev => prev.map(x => x.id === o.id ? { ...x, status: 'paid' } : x));
        Alert.alert('✓ Confirmed', 'Payment verified! Your order is complete.');
      } else {
        Alert.alert('Not confirmed', 'Payment not found yet. Try again after completing payment.');
      }
    } catch (e: any) { Alert.alert('Error', e.message); }
  }

  async function handleDownload(o: ShopOrder) {
    try {
      const { mediaUrl } = await getDownloadLink(o.id);
      await Linking.openURL(mediaUrl);
    } catch (e: any) { Alert.alert('Error', e.message); }
  }

  // ── Filtered products ────────────────────────────────────────────────────────
  const allCat = { id: 'all', name: 'All', icon: '🛍', color: S.gold, sort_order: -1 };
  const allCats = [allCat, ...categories];
  const categoryMap = new Map<string | null, ShopProduct[]>();
  categoryMap.set(null, []);
  categories.forEach(c => categoryMap.set(c.id, []));
  products
    .filter(p => selectedCat === null || p.category_id === selectedCat || (selectedCat === 'all' && true))
    .forEach(p => {
      if (selectedCat !== null) return; // when category selected, group differently
      const arr = categoryMap.get(p.category_id) ?? categoryMap.get(null)!;
      arr.push(p);
    });

  const filteredProducts = selectedCat && selectedCat !== 'all'
    ? products.filter(p => p.category_id === selectedCat)
    : products;

  // Sections: either one per category, or a single "All" section
  const sections: { id: string; name: string; icon: string; items: ShopProduct[] }[] =
    (!selectedCat || selectedCat === 'all')
      ? categories.map(c => ({
          id: c.id, name: c.name, icon: c.icon,
          items: products.filter(p => p.category_id === c.id),
        })).concat(
          products.filter(p => !p.category_id).length > 0
            ? [{ id: 'uncategorised', name: 'Other Items', icon: '🛍', items: products.filter(p => !p.category_id) }]
            : []
        )
      : [{ id: selectedCat, name: categories.find(c => c.id === selectedCat)?.name ?? '', icon: categories.find(c => c.id === selectedCat)?.icon ?? '🛍', items: filteredProducts }];

  // ── Show splash ──────────────────────────────────────────────────────────────
  if (!splashDone) return <ShopSplash onDone={() => setSplashDone(true)} />;

  return (
    <View style={{ flex: 1, backgroundColor: S.cream }}>
      {/* Header */}
      <LinearGradient colors={[S.dark, '#4A2A0A', S.mid]} style={[main.header, { paddingTop: spacing.sm + insets.top }]}>
        <View style={main.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={main.backBtn}>
            <Text style={main.backText}>‹</Text>
          </Pressable>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={main.headerTitle}>🛍 Olive Shop</Text>
            {membership?.churches?.name && (
              <Text style={main.churchBadge}>⛪ {membership.churches.name}</Text>
            )}
          </View>
          <Pressable style={main.ordersBtn} onPress={openOrders}>
            <Text style={main.ordersBtnText}>My Orders</Text>
          </Pressable>
        </View>

        {/* Category pills */}
        {categories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.sm }}>
            {allCats.map((c, i) => (
              <CategoryPill
                key={c.id}
                cat={c as any}
                isActive={selectedCat === null ? c.id === 'all' : selectedCat === c.id}
                onPress={() => setSelectedCat(c.id === 'all' ? null : c.id)}
                delay={i * 70}
              />
            ))}
          </ScrollView>
        )}
      </LinearGradient>

      {/* Body */}
      {!membership && !loading ? (
        <View style={main.empty}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🛍</Text>
          <Text style={main.emptyTitle}>Join a church to start shopping</Text>
          <Text style={main.emptyDesc}>Browse and purchase items from your church community.</Text>
          <Pressable style={main.selectBtn} onPress={() => setShowChurchSelect(true)}>
            <Text style={main.selectBtnText}>Select Church</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <ActivityIndicator color={S.gold} style={{ marginTop: 60 }} />
      ) : products.length === 0 ? (
        <View style={main.empty}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🛒</Text>
          <Text style={main.emptyTitle}>No products yet</Text>
          <Text style={main.emptyDesc}>Check back soon — your church hasn't listed any products yet.</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: 80 + insets.bottom }}
          refreshing={refreshing}
          onScroll={undefined}
        >
          {sections.map(section => (
            <CategorySection
              key={section.id}
              category={section}
              products={section.items}
              onProductPress={openProduct}
            />
          ))}
        </ScrollView>
      )}

      {/* Church select modal */}
      <ChurchSelectModal
        visible={showChurchSelect}
        onSelect={handleChurchSelected}
        onClose={() => setShowChurchSelect(false)}
      />

      {/* Product detail modal */}
      <Modal visible={showDetail} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDetail(false)}>
        {selectedProduct && (
          <ProductDetailSheet
            product={selectedProduct}
            onClose={() => setShowDetail(false)}
            onBuy={handleBuy}
            onGetFree={handleGetFree}
            loading={purchasing}
          />
        )}
      </Modal>

      {/* Delivery address modal (physical products) */}
      <Modal visible={showDelivery} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDelivery(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: S.cream }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <LinearGradient colors={[S.dark, S.mid]} style={{ paddingTop: 48, paddingBottom: 20, paddingHorizontal: spacing.lg }}>
            <Pressable onPress={() => setShowDelivery(false)}>
              <Text style={{ color: S.goldLight, fontSize: 15, marginBottom: 8 }}>‹ Back</Text>
            </Pressable>
            <Text style={{ fontSize: 20, fontWeight: '800', color: S.goldLight }}>📦 Delivery Details</Text>
          </LinearGradient>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            <Text style={{ fontSize: 13, color: colors.inkFaint, marginBottom: spacing.sm }}>FULL NAME</Text>
            <TextInput
              style={delv.input} value={buyerName} onChangeText={setBuyerName}
              placeholder="Your name" placeholderTextColor={colors.inkFaint}
            />
            <Text style={{ fontSize: 13, color: colors.inkFaint, marginTop: spacing.md, marginBottom: spacing.sm }}>DELIVERY ADDRESS</Text>
            <TextInput
              style={[delv.input, { minHeight: 90, textAlignVertical: 'top' }]}
              value={deliveryAddr} onChangeText={setDeliveryAddr}
              placeholder="Street, city, state, country…"
              placeholderTextColor={colors.inkFaint} multiline
            />
            <Pressable
              style={[delv.proceed, purchasing && { opacity: 0.6 }]}
              onPress={() => doPurchase(deliveryAddr)}
              disabled={purchasing}
            >
              {purchasing
                ? <ActivityIndicator color="#fff" />
                : <Text style={delv.proceedText}>Proceed to Payment 💳</Text>}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* My Orders modal */}
      <Modal visible={showOrders} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowOrders(false)}>
        <MyOrdersSheet
          orders={orders} loading={ordersLoading}
          onClose={() => setShowOrders(false)}
          onDownload={handleDownload}
          onVerify={handleVerify}
        />
      </Modal>
    </View>
  );
}

const main = StyleSheet.create({
  header: { paddingBottom: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  backBtn: { padding: 4 },
  backText: { color: S.goldLight, fontSize: 28, lineHeight: 30 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: S.goldLight },
  churchBadge: { fontSize: 11, color: 'rgba(245,214,128,0.7)', marginTop: 2 },
  ordersBtn: { backgroundColor: 'rgba(196,134,10,0.25)', borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: S.gold },
  ordersBtnText: { color: S.goldLight, fontSize: 12, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, textAlign: 'center', marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: colors.inkSoft, textAlign: 'center', lineHeight: 21, marginBottom: spacing.lg },
  selectBtn: { backgroundColor: S.gold, borderRadius: radii.xl, paddingHorizontal: 24, paddingVertical: 14 },
  selectBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

const delv = StyleSheet.create({
  input: { backgroundColor: '#fff', borderRadius: radii.md, padding: spacing.md, fontSize: 15, color: colors.ink, borderWidth: 1.5, borderColor: colors.parchmentDark, marginBottom: spacing.sm },
  proceed: { backgroundColor: S.gold, borderRadius: radii.xl, paddingVertical: 16, alignItems: 'center', marginTop: spacing.lg, ...shadows.card },
  proceedText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
