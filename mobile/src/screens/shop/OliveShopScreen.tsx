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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  getMyShopChurch, getAllChurches, getShopCategories, getShopProducts,
  getShopProductDetail, getShopCart, addShopCartItem, addShopWishlist, removeShopWishlist,
  getShopWishlist, updateShopCartItem, removeShopCartItem,
  getMyOrders, getShopOrder, initiateShopOrder, initiateShopCartOrder, verifyShopOrder, getDownloadLink,
  type ShopChurch, type ShopCategory, type ShopProduct, type ShopOrder,
} from '../../lib/shopApi';
import { colors, radii, spacing, typography, shadows } from '../../theme/theme';
import { SkeletonBox } from '../../components/SkeletonCard';

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
function ProductCard({ product, onPress, onAddToCart, delay = 0 }: {
  product: ShopProduct; onPress: () => void; onAddToCart?: () => void; delay?: number;
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

  const typeIcon: 'cube-outline' | 'download-outline' | 'musical-notes-outline' = { physical: 'cube-outline', digital: 'download-outline', media: 'musical-notes-outline' }[product.product_type] as any ?? 'cube-outline';

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
                <Ionicons name={typeIcon} size={40} color={S.goldLight} />
              </LinearGradient>}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={pc.gradient} />
          <View style={[pc.priceBadge, product.is_free && { backgroundColor: '#2E7D32' }]}>
            <Text style={pc.priceText}>{priceLabel}</Text>
          </View>
          <View style={pc.typeBadge}><Ionicons name={typeIcon} size={10} color="#fff" /></View>
          {onAddToCart && (
            <Pressable
              style={pc.cartMiniBtn}
              onPress={(e) => {
                e.stopPropagation();
                onAddToCart();
              }}
            >
              <Ionicons name="cart-outline" size={14} color="#fff" />
            </Pressable>
          )}
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
  card: { width: 158, height: 250, marginRight: spacing.sm, backgroundColor: '#fff', borderRadius: radii.lg, overflow: 'hidden', ...shadows.card },
  imageWrap: { width: '100%', height: 160, position: 'relative', backgroundColor: S.parchment, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  gradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 },
  priceBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: S.gold, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3 },
  priceText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  typeBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 2 },
  cartMiniBtn: { position: 'absolute', right: 8, bottom: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(44, 62, 32, 0.9)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  info: { flex: 1, padding: spacing.sm, justifyContent: 'center' },
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
function CategorySection({ category, products, onProductPress, onAddToCart }: {
  category: { name: string; icon: string };
  products: ShopProduct[];
  onProductPress: (p: ShopProduct) => void;
  onAddToCart: (p: ShopProduct) => void;
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
          <ProductCard
            product={item}
            delay={index * 60}
            onPress={() => onProductPress(item)}
            onAddToCart={() => onAddToCart(item)}
          />
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
function ProductDetailSheet({ product, relatedProducts, onClose, onBuy, onGetFree, onAddToCart, onRelated, loading, wishlisted, onToggleWishlist, cartCount, insets }: {
  product: ShopProduct; onClose: () => void;
  relatedProducts: ShopProduct[];
  onBuy: (options: { quantity: number; selectedColor: string | null; selectedSize: string | null }) => void;
  onGetFree: (options: { quantity: number; selectedColor: string | null; selectedSize: string | null }) => void;
  onAddToCart: (options: { quantity: number; selectedColor: string | null; selectedSize: string | null }) => void;
  onRelated: (product: ShopProduct) => void;
  loading: boolean; wishlisted: boolean; onToggleWishlist: () => void; cartCount: number; insets?: { bottom: number };
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [quantity, setQuantity] = useState(1);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.04, duration: 700, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
    ])).start();
  }, []);

  const typeLabel = { physical: 'Physical Product', digital: 'Digital Download', media: 'Media / Audio' }[product.product_type];
  const typeIcon: 'cube-outline' | 'download-outline' | 'musical-notes-outline' = { physical: 'cube-outline', digital: 'download-outline', media: 'musical-notes-outline' }[product.product_type] as any ?? 'cube-outline';
  const priceLabel = product.is_free
    ? 'FREE'
    : `${product.currency === 'NGN' ? '₦' : product.currency}${Number(product.price).toLocaleString()}`;
  const images = Array.from(new Set([product.thumbnail_url, ...(product.image_urls ?? [])].filter(Boolean))) as string[];
  const options = { quantity, selectedColor, selectedSize };
  const metadata = [
    product.condition && ['Condition', product.condition],
    product.estimated_delivery && ['Estimated delivery', product.estimated_delivery],
    product.shipping_cost !== undefined && [`Shipping`, product.shipping_cost > 0 ? `${product.currency === 'NGN' ? '₦' : product.currency}${Number(product.shipping_cost).toLocaleString()}` : 'Free'],
  ].filter(Boolean) as string[][];

  return (
    <ScrollView style={ds.sheet} contentContainerStyle={ds.sheetContent} showsVerticalScrollIndicator={false}>
      <Pressable style={ds.closeBtn} onPress={onClose}>
        <Text style={ds.closeText}>✕</Text>
      </Pressable>

      {/* Product gallery */}
      <View style={ds.imageWrap}>
        {images.length
          ? <FlatList
              data={images} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              keyExtractor={(uri, index) => `${uri}-${index}`}
              renderItem={({ item: uri }) => <Image source={{ uri }} style={ds.image} resizeMode="cover" />}
            />
          : <LinearGradient colors={[S.mid, S.dark]} style={ds.image}>
              <Ionicons name={typeIcon} size={60} color={S.goldLight} />
            </LinearGradient>}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.5)']} style={ds.imgGrad} pointerEvents="none" />
        <View style={ds.pricePill}><Text style={ds.priceText}>{priceLabel}</Text></View>
        <Pressable style={ds.wishBtn} onPress={onToggleWishlist}>
          <Text style={{ fontSize: 22 }}>{wishlisted ? '♥' : '♡'}</Text>
        </Pressable>
        <Pressable style={ds.cartTopBtn} onPress={() => onAddToCart(options)}>
          <Ionicons name="cart-outline" size={18} color="#fff" />
          {cartCount > 0 && <View style={ds.cartTopBadge}><Text style={ds.cartTopBadgeText}>{cartCount}</Text></View>}
        </Pressable>
      </View>

      {/* Info */}
      <View style={ds.body}>
        <View style={ds.typeBadge}>
          <Ionicons name={typeIcon} size={14} color={S.gold} />
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
        {!!metadata.length && <View style={ds.metaCard}>
          {metadata.map(([label, value]) => <View style={ds.metaRow} key={label}><Text style={ds.metaLabel}>{label}</Text><Text style={ds.metaValue}>{value}</Text></View>)}
        </View>}
        {product.import_fee_info ? <View style={ds.infoCard}><Text style={ds.sectionTitle}>Import fees & information</Text><Text style={ds.infoText}>{product.import_fee_info}</Text></View> : null}
        {product.return_policy ? <View style={ds.infoCard}><Text style={ds.sectionTitle}>Return policy</Text><Text style={ds.infoText}>{product.return_policy}</Text></View> : null}
        {product.specifications && Object.keys(product.specifications).length > 0 ? <View style={ds.infoCard}>
          <Text style={ds.sectionTitle}>Product specifications</Text>
          {Object.entries(product.specifications).map(([key, value]) => <View style={ds.specRow} key={key}><Text style={ds.specKey}>{key}</Text><Text style={ds.specValue}>{String(value)}</Text></View>)}
        </View> : null}
        {!!product.available_colors?.length && <View style={ds.optionBlock}>
          <Text style={ds.sectionTitle}>Color {selectedColor ? `— ${selectedColor}` : ''}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>{product.available_colors.map(color =>
            <Pressable key={color} onPress={() => setSelectedColor(color)} style={[ds.option, selectedColor === color && ds.optionSelected]}><Text style={[ds.optionText, selectedColor === color && ds.optionTextSelected]}>{color}</Text></Pressable>
          )}</ScrollView>
        </View>}
        {!!product.available_sizes?.length && <View style={ds.optionBlock}>
          <Text style={ds.sectionTitle}>Size {selectedSize ? `— ${selectedSize}` : ''}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>{product.available_sizes.map(size =>
            <Pressable key={size} onPress={() => setSelectedSize(size)} style={[ds.option, selectedSize === size && ds.optionSelected]}><Text style={[ds.optionText, selectedSize === size && ds.optionTextSelected]}>{size}</Text></Pressable>
          )}</ScrollView>
        </View>}
        <View style={ds.quantityRow}>
          <Text style={ds.sectionTitle}>Quantity</Text>
          <View style={ds.quantityControls}>
            <Pressable style={ds.quantityBtn} onPress={() => setQuantity(q => Math.max(1, q - 1))}><Text style={ds.quantityBtnText}>−</Text></Pressable>
            <Text style={ds.quantity}>{quantity}</Text>
            <Pressable style={ds.quantityBtn} onPress={() => setQuantity(q => Math.min(product.stock_count ?? 99, q + 1))}><Text style={ds.quantityBtnText}>+</Text></Pressable>
          </View>
        </View>
      </View>

      {/* CTA */}
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: 40 + (insets?.bottom ?? 0) }}>
        {product.product_type === 'physical' && <Pressable style={ds.cartBtn} onPress={() => onAddToCart(options)} disabled={loading}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="cart-outline" size={16} color={S.gold} />
            <Text style={ds.cartText}>Add to cart</Text>
          </View>
        </Pressable>}
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Pressable
            style={[ds.buyBtn, (loading || product.stock_count === 0) && { opacity: 0.6 }]}
            onPress={() => product.is_free ? onGetFree(options) : onBuy(options)}
            disabled={loading || product.stock_count === 0}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={ds.buyText}>
                  {product.is_free ? '🎁 Get for Free' : '💳 Buy Now — ' + priceLabel}
                </Text>}
          </Pressable>
        </Animated.View>
        {product.seller ? <View style={ds.sellerCard}>
          {product.seller.logoUrl ? <Image source={{ uri: product.seller.logoUrl }} style={ds.sellerLogo} /> : <Text style={{ fontSize: 28 }}>⛪</Text>}
          <View style={{ flex: 1 }}><Text style={ds.sectionTitle}>About this seller</Text><Text style={ds.sellerName}>{product.seller.name}</Text>
            {product.seller.about || product.seller.description ? <Text style={ds.infoText}>{product.seller.about || product.seller.description}</Text> : null}
            {!!product.seller.address && <View style={ds.sellerDetail}><Text style={ds.sellerDetailLabel}>Pickup / address</Text><Text style={ds.infoText}>{product.seller.address}</Text></View>}
            {!!product.seller.policies && <View style={ds.sellerDetail}><Text style={ds.sellerDetailLabel}>Seller policies</Text><Text style={ds.infoText}>{product.seller.policies}</Text></View>}
            <View style={ds.sellerContacts}>
              {!!product.seller.website && <Text style={ds.sellerContact}>{product.seller.website}</Text>}
              {!!product.seller.email && <Text style={ds.sellerContact}>{product.seller.email}</Text>}
              {!!product.seller.phone && <Text style={ds.sellerContact}>{product.seller.phone}</Text>}
            </View>
          </View>
        </View> : null}
        {!!relatedProducts.length && <View style={{ marginTop: spacing.lg }}>
          <Text style={ds.sectionTitle}>Related products</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
            {relatedProducts.map(related => <Pressable key={related.id} style={ds.relatedCard} onPress={() => onRelated(related)}>
              {related.thumbnail_url ? <Image source={{ uri: related.thumbnail_url }} style={ds.relatedImage} /> : <View style={[ds.relatedImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: S.parchment }]}><Text>🛍</Text></View>}
              <Text style={ds.relatedTitle} numberOfLines={2}>{related.title}</Text>
            </Pressable>)}
          </ScrollView>
        </View>}
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
  wishBtn: { position: 'absolute', top: 16, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  cartTopBtn: { position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(33,35,25,0.72)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  cartTopBadge: { position: 'absolute', right: -3, top: -3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: S.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  cartTopBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  body: { padding: spacing.lg },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  typeIcon: { fontSize: 14 },
  typeLabel: { fontSize: 12, color: S.gold, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, lineHeight: 28, marginBottom: 6 },
  church: { fontSize: 13, color: colors.inkFaint, marginBottom: spacing.md },
  desc: { fontSize: 15, color: colors.inkSoft, lineHeight: 23, marginBottom: spacing.md },
  stock: { fontSize: 13, color: colors.inkFaint, fontStyle: 'italic' },
  metaCard: { backgroundColor: '#fff', borderRadius: radii.md, padding: spacing.md, marginTop: spacing.md },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: S.parchment },
  metaLabel: { fontSize: 13, color: colors.inkFaint }, metaValue: { fontSize: 13, color: colors.ink, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },
  infoCard: { marginTop: spacing.md, padding: spacing.md, backgroundColor: '#fff', borderRadius: radii.md },
  sectionTitle: { color: colors.ink, fontSize: 14, fontWeight: '800', marginBottom: 6 },
  infoText: { color: colors.inkSoft, fontSize: 13, lineHeight: 20 },
  specRow: { flexDirection: 'row', paddingVertical: 5 }, specKey: { width: '42%', color: colors.inkFaint, fontSize: 13 }, specValue: { flex: 1, color: colors.inkSoft, fontSize: 13 },
  optionBlock: { marginTop: spacing.md }, option: { borderWidth: 1, borderColor: colors.parchmentDark, borderRadius: radii.pill, paddingHorizontal: 13, paddingVertical: 8, marginRight: 8, backgroundColor: '#fff' }, optionSelected: { backgroundColor: S.gold, borderColor: S.gold }, optionText: { color: colors.inkSoft, fontSize: 13 }, optionTextSelected: { color: '#fff', fontWeight: '800' },
  quantityRow: { marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, quantityControls: { flexDirection: 'row', alignItems: 'center', gap: 14 }, quantityBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: S.parchment, alignItems: 'center', justifyContent: 'center' }, quantityBtnText: { fontSize: 22, color: S.dark }, quantity: { fontSize: 16, fontWeight: '800', color: colors.ink },
  cartBtn: { borderWidth: 1.5, borderColor: S.gold, borderRadius: radii.xl, paddingVertical: 14, alignItems: 'center', marginBottom: spacing.sm }, cartText: { color: S.gold, fontSize: 16, fontWeight: '800' },
  buyBtn: { backgroundColor: S.gold, borderRadius: radii.xl, paddingVertical: 16, alignItems: 'center', ...shadows.card },
  buyText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  sellerCard: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md, backgroundColor: '#fff', borderRadius: radii.md }, sellerLogo: { width: 48, height: 48, borderRadius: 24 }, sellerName: { fontSize: 13, fontWeight: '700', color: S.gold, marginBottom: 4 }, sellerContact: { color: S.gold, fontSize: 12, marginTop: 3 }, sellerDetail: { marginTop: spacing.sm }, sellerDetailLabel: { color: colors.inkFaint, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }, sellerContacts: { marginTop: spacing.sm },
  relatedCard: { width: 120, marginRight: spacing.sm, backgroundColor: '#fff', borderRadius: radii.md, overflow: 'hidden' }, relatedImage: { width: 120, height: 90 }, relatedTitle: { padding: 7, color: colors.ink, fontSize: 12, fontWeight: '700' },
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
                {o.invoice_number ? (
                  <Text style={{ fontSize: 12, color: colors.inkFaint, marginBottom: 4 }}>Invoice: {o.invoice_number}</Text>
                ) : null}
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
                  {/* Pickup collection code / QR */}
                  {o.status === 'paid' && o.fulfillment_method === 'pickup' && o.collection_code && (
                    <View style={{ marginLeft: 6, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 11, color: colors.inkFaint }}>Collect code</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800' }}>{o.collection_code}</Text>
                    </View>
                  )}
                  {o.status === 'paid' && o.collection_qr && (
                    <Image source={{ uri: o.collection_qr }} style={{ width: 54, height: 54, marginLeft: 8, borderRadius: 6 }} />
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

function WishlistSheet({ products, loading, onClose, onProduct, onRemove }: {
  products: ShopProduct[];
  loading: boolean;
  onClose: () => void;
  onProduct: (product: ShopProduct) => void;
  onRemove: (productId: string) => void;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: S.cream }}>
      <LinearGradient colors={[S.dark, S.mid]} style={{ paddingTop: 48, paddingBottom: 18, paddingHorizontal: spacing.lg }}>
        <Pressable onPress={onClose}><Text style={{ color: S.goldLight, marginBottom: 8 }}>✕ Close</Text></Pressable>
        <Text style={{ fontSize: 22, fontWeight: '800', color: S.goldLight }}>♡ Wishlist</Text>
      </LinearGradient>
      {loading ? <ActivityIndicator color={S.gold} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={products}
          keyExtractor={p => p.id}
          contentContainerStyle={{ padding: spacing.lg }}
          ListEmptyComponent={
            <View style={main.empty}>
              <Text style={{ fontSize: 44 }}>♡</Text>
              <Text style={main.emptyTitle}>Your wishlist is empty</Text>
              <Text style={main.emptyDesc}>Tap the heart on a product to save it here.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={wish.row} onPress={() => onProduct(item)}>
              {item.thumbnail_url
                ? <Image source={{ uri: item.thumbnail_url }} style={wish.image} />
                : <View style={[wish.image, { backgroundColor: S.parchment, alignItems: 'center', justifyContent: 'center' }]}><Text>🛍</Text></View>}
              <View style={{ flex: 1 }}>
                <Text style={wish.title} numberOfLines={2}>{item.title}</Text>
                <Text style={wish.price}>{item.is_free ? 'FREE' : `${item.currency === 'NGN' ? '₦' : item.currency}${Number(item.price).toLocaleString()}`}</Text>
              </View>
              <Pressable onPress={() => onRemove(item.id)} hitSlop={10}><Text style={wish.remove}>♥</Text></Pressable>
            </Pressable>
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
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);
  const [showDetail, setShowDetail]     = useState(false);
  const [relatedProducts, setRelatedProducts] = useState<ShopProduct[]>([]);
  const [wishlistIds, setWishlistIds]   = useState<Set<string>>(new Set());
  const [cartItems, setCartItems]       = useState<import('../../lib/shopApi').ShopCartItem[]>([]);
  const [showCart, setShowCart]          = useState(false);
  const [cartLoading, setCartLoading]    = useState(false);
  const [showOrders, setShowOrders]     = useState(false);
  const [orders, setOrders]             = useState<ShopOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersSub, setOrdersSub] = useState<any | null>(null);
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
      const [cats, { products: prods }, wishlist, cart] = await Promise.all([
        getShopCategories(m.church_id),
        getShopProducts({ churchId: m.church_id }),
        getShopWishlist().catch(() => []),
        getShopCart().catch(() => []),
      ]);
      setCategories(cats);
      setProducts(prods);
      setWishlistIds(new Set(wishlist.map(p => p.id)));
      setCartItems(cart);
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
    setRelatedProducts([]);
    setShowDetail(true);
    getShopProductDetail(p.id).then(({ product, relatedProducts: related }) => {
      setSelectedProduct(product);
      setRelatedProducts(related);
    }).catch(() => {});
  }

  type ProductOptions = { quantity: number; selectedColor: string | null; selectedSize: string | null };
  const [purchaseOptions, setPurchaseOptions] = useState<ProductOptions>({ quantity: 1, selectedColor: null, selectedSize: null });
  const [fulfillmentMethod, setFulfillmentMethod] = useState<'pickup' | 'delivery'>('delivery');
  const [shippingPhone, setShippingPhone] = useState('');
  const [showCartCheckout, setShowCartCheckout] = useState(false);

  async function handleBuy(options: ProductOptions) {
    if (!selectedProduct) return;
    setPurchaseOptions(options);
    if (selectedProduct.product_type === 'physical') {
      setShowDelivery(true);
      return;
    }
    await doPurchase(undefined, options);
  }

  async function handleGetFree(options: ProductOptions) {
    setPurchaseOptions(options);
    await doPurchase(undefined, options);
  }

  async function doPurchase(addr?: string, options = purchaseOptions) {
    if (!selectedProduct) return;
    setPurchasing(true);
    try {
      const result = await initiateShopOrder({
        productId: selectedProduct.id,
        buyerName: buyerName.trim() || undefined,
        deliveryAddress: addr || undefined,
        quantity: options.quantity,
        selectedColor: options.selectedColor,
        selectedSize: options.selectedSize,
        fulfillmentMethod,
        shippingPhone: shippingPhone.trim() || undefined,
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
        // Start background poll to auto-verify the payment until it succeeds or times out
        (async function pollVerify(txRef) {
          const maxAttempts = 30; // ~2 minutes
          let attempts = 0;
          const interval = 4000;
          const tid = setInterval(async () => {
            attempts += 1;
            try {
              const res = await verifyShopOrder(txRef);
              if (res?.ok && res.order?.status === 'paid') {
                clearInterval(tid);
                setPendingTxRef(null);
                setOrders(prev => prev.map(x => x.id === res.order.id ? { ...x, status: 'paid' } : x));
                Alert.alert('✓ Payment confirmed', 'Your payment has been verified.');
                return;
              }
            } catch (e) {
              // ignore transient errors
            }
            if (attempts >= maxAttempts) {
              clearInterval(tid);
              setPendingTxRef(null);
              Alert.alert('Payment pending', 'Payment not confirmed yet. Check My Orders later.');
            }
          }, interval);
        })(result.txRef ?? '');
        Alert.alert('Payment Opened', 'Complete the payment in your browser. We will verify it automatically and notify you when confirmed.', [{ text: 'OK' }]);
      }
    } catch (e: any) { Alert.alert('Purchase Error', e.message ?? 'Could not start purchase'); }
    finally { setPurchasing(false); }
  }

  async function handleAddToCart(options: ProductOptions) {
    if (!selectedProduct) return;
    try {
      const item = await addShopCartItem({ productId: selectedProduct.id, ...options });
      setCartItems(prev => {
        const without = prev.filter(x => x.id !== item.id);
        return [...without, { ...item, shop_products: selectedProduct }];
      });
    } catch (e: any) { Alert.alert('Cart Error', e.message ?? 'Could not add item'); }
  }

  async function quickAddToCart(product: ShopProduct) {
    try {
      const item = await addShopCartItem({ productId: product.id, quantity: 1, selectedColor: null, selectedSize: null });
      setCartItems(prev => {
        const without = prev.filter(x => x.id !== item.id);
        return [...without, { ...item, shop_products: product }];
      });
    } catch (e: any) { Alert.alert('Cart Error', e.message ?? 'Could not add item'); }
  }

  async function toggleWishlist(productId: string) {
    const active = wishlistIds.has(productId);
    try {
      if (active) await removeShopWishlist(productId); else await addShopWishlist(productId);
      setWishlistIds(prev => {
        const next = new Set(prev);
        if (active) next.delete(productId); else next.add(productId);
        return next;
      });
    } catch (e: any) { Alert.alert('Wishlist Error', e.message ?? 'Could not update wishlist'); }
  }

  async function openCart() {
    setShowCart(true); setCartLoading(true);
    try { setCartItems(await getShopCart()); } catch (e: any) { Alert.alert('Cart Error', e.message); }
    finally { setCartLoading(false); }
  }

  async function checkoutCart() {
    if (!cartItems.length) return;
    setShowCartCheckout(true);
    setFulfillmentMethod('delivery');
  }

  async function submitCartCheckout() {
    if (!cartItems.length) return;
    if (fulfillmentMethod === 'delivery' && !deliveryAddr.trim()) {
      Alert.alert('Delivery address required', 'Enter the address where your order should be delivered.');
      return;
    }
    setPurchasing(true);
    try {
      const result = await initiateShopCartOrder({
        buyerName: buyerName.trim() || undefined,
        deliveryAddress: fulfillmentMethod === 'delivery' ? deliveryAddr.trim() : undefined,
        shippingName: buyerName.trim() || undefined,
        shippingPhone: shippingPhone.trim() || undefined,
        fulfillmentMethod,
      });
      setShowCartCheckout(false);
      setShowCart(false);
      if (result.paymentLink) {
        await Linking.openURL(result.paymentLink);
        Alert.alert('Payment opened', 'Complete payment in your browser, then return to My Orders to verify it.');
      }
    } catch (e: any) {
      Alert.alert('Cart checkout error', e.message ?? 'Could not start cart checkout');
    } finally {
      setPurchasing(false);
    }
  }

  async function changeCartQuantity(item: import('../../lib/shopApi').ShopCartItem, quantity: number) {
    try {
      if (quantity <= 0) {
        await removeShopCartItem(item.id);
        setCartItems(prev => prev.filter(x => x.id !== item.id));
      } else {
        const updated = await updateShopCartItem(item.id, quantity);
        setCartItems(prev => prev.map(x => x.id === item.id ? { ...x, ...updated } : x));
      }
    } catch (e: any) { Alert.alert('Cart Error', e.message); }
  }

  // ── Orders ──────────────────────────────────────────────────────────────────
  async function openOrders() {
    setShowOrders(true);
    setOrdersLoading(true);
    try { setOrders(await getMyOrders()); } catch {}
    finally { setOrdersLoading(false); }
    // subscribe to realtime order updates
    try {
      const sub = await import('../../lib/shopApi').then(m => m.subscribeToMyOrders((payload: any) => {
        const ev = payload.eventType ?? payload.event;
        const newRow = payload.new ?? payload.record ?? null;
        if (!newRow) return;
        setOrders(prev => prev.map(x => x.id === newRow.id ? { ...x, ...newRow } : x));
      }));
      setOrdersSub(sub);
    } catch {}
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

  function closeOrdersSheet() {
    setShowOrders(false);
    if (ordersSub?.unsubscribe) {
      try { ordersSub.unsubscribe(); } catch {};
      setOrdersSub(null);
    }
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
          <Pressable style={main.cartBtn} onPress={openCart}>
            <Ionicons name="cart-outline" size={15} color="#fff" />
            {cartItems.length > 0 && <Text style={main.cartBtnText}>{cartItems.length}</Text>}
          </Pressable>
        </View>

        {/* Category pills */}
        {categories.length > 0 && (
          <View style={main.categoryRow}>
            <Pressable style={main.menuButton} onPress={() => setShowCategoryMenu(true)}>
              <Ionicons name="menu-outline" size={18} color={S.goldLight} />
              <Text style={main.menuButtonText}>Categories</Text>
            </Pressable>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: spacing.sm }}>
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
          </View>
        )}
      </LinearGradient>

      {loading ? (
        <ScrollView contentContainerStyle={{ paddingTop: spacing.lg, paddingHorizontal: spacing.lg, gap: spacing.md }}>
          {[1,2,3,4].map(i => (
            <View key={i} style={{ gap: spacing.sm }}>
              <SkeletonBox height={200} borderRadius={radii.lg} />
            </View>
          ))}
        </ScrollView>
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
        >
          {sections.map(section => (
            <CategorySection
              key={section.id}
              category={section}
              products={section.items}
              onProductPress={openProduct}
              onAddToCart={quickAddToCart}
            />
          ))}
        </ScrollView>
      )}

      <Modal visible={showCategoryMenu} animationType="slide" transparent onRequestClose={() => setShowCategoryMenu(false)}>
        <Pressable style={main.categoryMenuBackdrop} onPress={() => setShowCategoryMenu(false)}>
          <View style={main.categoryMenuCard}>
            <Text style={main.categoryMenuTitle}>Shop Categories</Text>
            {allCats.map((cat) => (
              <Pressable
                key={cat.id}
                style={[main.categoryMenuRow, (selectedCat === null && cat.id === 'all') || selectedCat === cat.id ? main.categoryMenuRowActive : null]}
                onPress={() => {
                  setSelectedCat(cat.id === 'all' ? null : cat.id);
                  setShowCategoryMenu(false);
                }}
              >
                <Text style={main.categoryMenuIcon}>{cat.icon}</Text>
                <Text style={main.categoryMenuLabel}>{cat.name}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

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
            relatedProducts={relatedProducts}
            onClose={() => setShowDetail(false)}
            onBuy={handleBuy}
            onGetFree={handleGetFree}
            onAddToCart={handleAddToCart}
            onRelated={openProduct}
            loading={purchasing}
            wishlisted={wishlistIds.has(selectedProduct.id)}
            onToggleWishlist={() => toggleWishlist(selectedProduct.id)}
            cartCount={cartItems.length}
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
            <Text style={{ fontSize: 13, color: colors.inkFaint, marginBottom: spacing.sm }}>FULFILLMENT</Text>
            <View style={delv.methodRow}>
              {(['delivery', 'pickup'] as const).map(method => (
                <Pressable key={method} onPress={() => setFulfillmentMethod(method)} style={[delv.method, fulfillmentMethod === method && delv.methodActive]}>
                  <Text style={[delv.methodText, fulfillmentMethod === method && delv.methodTextActive]}>{method === 'delivery' ? '🚚 Delivery' : '⛪ Pickup'}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ fontSize: 13, color: colors.inkFaint, marginBottom: spacing.sm }}>FULL NAME</Text>
            <TextInput
              style={delv.input} value={buyerName} onChangeText={setBuyerName}
              placeholder="Your name" placeholderTextColor={colors.inkFaint}
            />
            <Text style={{ fontSize: 13, color: colors.inkFaint, marginTop: spacing.md, marginBottom: spacing.sm }}>PHONE</Text>
            <TextInput style={delv.input} value={shippingPhone} onChangeText={setShippingPhone} placeholder="Phone number" placeholderTextColor={colors.inkFaint} keyboardType="phone-pad" />
            {fulfillmentMethod === 'delivery' && <>
              <Text style={{ fontSize: 13, color: colors.inkFaint, marginTop: spacing.md, marginBottom: spacing.sm }}>DELIVERY ADDRESS</Text>
              <TextInput
                style={[delv.input, { minHeight: 90, textAlignVertical: 'top' }]}
                value={deliveryAddr} onChangeText={setDeliveryAddr}
                placeholder="Street, city, state, country…"
                placeholderTextColor={colors.inkFaint} multiline
              />
            </>}
            <Pressable
              style={[delv.proceed, purchasing && { opacity: 0.6 }]}
                onPress={() => doPurchase(fulfillmentMethod === 'delivery' ? deliveryAddr : undefined, purchaseOptions)}
              disabled={purchasing}
            >
              {purchasing
                ? <ActivityIndicator color="#fff" />
                : <Text style={delv.proceedText}>Proceed to Payment 💳</Text>}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showCart} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCart(false)}>
        <View style={{ flex: 1, backgroundColor: S.cream }}>
          <LinearGradient colors={[S.dark, S.mid]} style={{ paddingTop: 48, paddingBottom: 18, paddingHorizontal: spacing.lg }}>
            <Pressable onPress={() => setShowCart(false)}><Text style={{ color: S.goldLight, marginBottom: 8 }}>✕ Close</Text></Pressable>
            <Text style={{ fontSize: 22, fontWeight: '800', color: S.goldLight }}>🛒 Your cart</Text>
          </LinearGradient>
          {cartLoading ? <ActivityIndicator color={S.gold} style={{ marginTop: 40 }} /> : <FlatList
            data={cartItems} keyExtractor={item => item.id} contentContainerStyle={{ padding: spacing.lg }}
            ListEmptyComponent={<View style={main.empty}><Text style={{ fontSize: 44 }}>🛒</Text><Text style={main.emptyTitle}>Your cart is empty</Text><Text style={main.emptyDesc}>Add physical products here before checkout.</Text></View>}
            renderItem={({ item }) => <View style={cart.row}>
              {item.shop_products?.thumbnail_url ? <Image source={{ uri: item.shop_products.thumbnail_url }} style={cart.image} /> : <View style={[cart.image, { backgroundColor: S.parchment, alignItems: 'center', justifyContent: 'center' }]}><Text>🛍</Text></View>}
              <View style={{ flex: 1 }}><Text style={cart.title} numberOfLines={2}>{item.shop_products?.title ?? 'Product'}</Text>
                <Text style={cart.price}>₦{Number(item.shop_products?.price ?? 0).toLocaleString()}</Text>
                {(item.selected_color || item.selected_size) ? <Text style={cart.variant}>{[item.selected_color, item.selected_size].filter(Boolean).join(' · ')}</Text> : null}
                <View style={cart.controls}><Pressable onPress={() => changeCartQuantity(item, item.quantity - 1)} style={cart.qtyBtn}><Text>−</Text></Pressable><Text style={cart.qty}>{item.quantity}</Text><Pressable onPress={() => changeCartQuantity(item, item.quantity + 1)} style={cart.qtyBtn}><Text>+</Text></Pressable><Pressable onPress={() => changeCartQuantity(item, 0)}><Text style={cart.remove}>Remove</Text></Pressable></View>
              </View>
            </View>}
          />}
          {!cartLoading && cartItems.length > 0 && (
            <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
              <Pressable style={delv.proceed} onPress={checkoutCart}>
                <Text style={delv.proceedText}>Checkout cart 💳</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>

      <Modal visible={showCartCheckout} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCartCheckout(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: S.cream }} behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}>
          <LinearGradient colors={[S.dark, S.mid]} style={{ paddingTop: 48, paddingBottom: 20, paddingHorizontal: spacing.lg }}>
            <Pressable onPress={() => setShowCartCheckout(false)}><Text style={{ color: S.goldLight, marginBottom: 8 }}>‹ Back</Text></Pressable>
            <Text style={{ fontSize: 20, fontWeight: '800', color: S.goldLight }}>Cart checkout</Text>
          </LinearGradient>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            <Text style={{ fontSize: 13, color: colors.inkFaint, marginBottom: spacing.sm }}>FULFILLMENT</Text>
            <View style={delv.methodRow}>
              {(['delivery', 'pickup'] as const).map(method => (
                <Pressable key={method} onPress={() => setFulfillmentMethod(method)} style={[delv.method, fulfillmentMethod === method && delv.methodActive]}>
                  <Text style={[delv.methodText, fulfillmentMethod === method && delv.methodTextActive]}>{method === 'delivery' ? '🚚 Delivery' : '⛪ Pickup'}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={delv.input} value={buyerName} onChangeText={setBuyerName} placeholder="Full name" placeholderTextColor={colors.inkFaint} />
            <TextInput style={delv.input} value={shippingPhone} onChangeText={setShippingPhone} placeholder="Phone number" placeholderTextColor={colors.inkFaint} keyboardType="phone-pad" />
            {fulfillmentMethod === 'delivery' && <TextInput style={[delv.input, { minHeight: 90, textAlignVertical: 'top' }]} value={deliveryAddr} onChangeText={setDeliveryAddr} placeholder="Delivery address" placeholderTextColor={colors.inkFaint} multiline />}
            <Pressable style={[delv.proceed, purchasing && { opacity: 0.6 }]} onPress={submitCartCheckout} disabled={purchasing}>
              {purchasing ? <ActivityIndicator color="#fff" /> : <Text style={delv.proceedText}>Proceed to payment 💳</Text>}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* My Orders modal */}
      <Modal visible={showOrders} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeOrdersSheet}>
        <MyOrdersSheet
          orders={orders} loading={ordersLoading}
          onClose={closeOrdersSheet}
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
  cartBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: S.gold, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 6 },
  cartBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  menuButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.08)' },
  menuButtonText: { color: S.goldLight, fontSize: 12, fontWeight: '700' },
  categoryMenuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.28)', justifyContent: 'center', paddingHorizontal: spacing.lg },
  categoryMenuCard: { backgroundColor: '#fff', borderRadius: radii.xl, padding: spacing.md },
  categoryMenuTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: spacing.sm },
  categoryMenuRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  categoryMenuRowActive: { backgroundColor: '#f4e6b4', borderRadius: radii.md },
  categoryMenuIcon: { fontSize: 18 },
  categoryMenuLabel: { fontSize: 14, color: colors.ink, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, textAlign: 'center', marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: colors.inkSoft, textAlign: 'center', lineHeight: 21, marginBottom: spacing.lg },
  selectBtn: { backgroundColor: S.gold, borderRadius: radii.xl, paddingHorizontal: 24, paddingVertical: 14 },
  selectBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

const cart = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, backgroundColor: '#fff', borderRadius: radii.lg, padding: spacing.sm, marginBottom: spacing.sm, ...shadows.subtle },
  image: { width: 72, height: 72, borderRadius: radii.md },
  title: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  price: { color: S.gold, fontSize: 13, fontWeight: '800', marginTop: 3 },
  variant: { color: colors.inkFaint, fontSize: 11, marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: S.parchment, alignItems: 'center', justifyContent: 'center' },
  qty: { color: colors.ink, fontWeight: '800' },
  remove: { color: '#B3452C', fontSize: 12, fontWeight: '700', marginLeft: 5 },
});

const wish = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: '#fff', borderRadius: radii.lg, padding: spacing.sm, marginBottom: spacing.sm, ...shadows.subtle },
  image: { width: 72, height: 72, borderRadius: radii.md },
  title: { color: colors.ink, fontSize: 14, fontWeight: '700', flex: 1 },
  price: { color: S.gold, fontSize: 13, fontWeight: '800', marginTop: 4 },
  remove: { color: '#B3452C', fontSize: 22 },
});

const delv = StyleSheet.create({
  input: { backgroundColor: '#fff', borderRadius: radii.md, padding: spacing.md, fontSize: 15, color: colors.ink, borderWidth: 1.5, borderColor: colors.parchmentDark, marginBottom: spacing.sm },
  proceed: { backgroundColor: S.gold, borderRadius: radii.xl, paddingVertical: 16, alignItems: 'center', marginTop: spacing.lg, ...shadows.card },
  proceedText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  methodRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  method: { flex: 1, paddingVertical: 12, borderRadius: radii.md, borderWidth: 1, borderColor: colors.parchmentDark, alignItems: 'center', backgroundColor: '#fff' },
  methodActive: { backgroundColor: S.gold, borderColor: S.gold },
  methodText: { color: colors.inkSoft, fontSize: 13, fontWeight: '700' },
  methodTextActive: { color: '#fff' },
});
