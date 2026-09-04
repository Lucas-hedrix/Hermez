import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import {
  fetchGiphyContent,
  GIPHY_CONTENT_TYPES,
  hasGiphyApiKey,
  trackGiphyAction,
} from '../services/giphy';

const PAGE_SIZE = 24;

export default function GiphyPicker({
  visible,
  onClose,
  onSelect,
  customerId,
  contentTypes = [GIPHY_CONTENT_TYPES.GIF, GIPHY_CONTENT_TYPES.STICKER],
}) {
  const { colors, isDark } = useTheme();
  const s = getStyles(colors, isDark);
  const [type, setType] = useState(
    contentTypes.includes(GIPHY_CONTENT_TYPES.GIF)
      ? GIPHY_CONTENT_TYPES.GIF
      : GIPHY_CONTENT_TYPES.STICKER,
  );
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const requestRef = useRef(0);
  const seenIdsRef = useRef(new Set());

  const load = useCallback(async ({ reset = false, contentType = type, search = query } = {}) => {
    if (!hasGiphyApiKey()) return;
    const requestId = ++requestRef.current;
    const offset = reset ? 0 : offsetRef.current;
    reset ? setLoading(true) : setLoadingMore(true);
    setError(null);

    try {
      const page = await fetchGiphyContent({
        type: contentType,
        query: search,
        offset,
        limit: PAGE_SIZE,
        customerId,
      });
      if (requestId !== requestRef.current) return;
      setItems((previousItems) => reset ? page.items : [...previousItems, ...page.items]);
      offsetRef.current = offset + page.items.length;
      setHasMore(page.items.length === PAGE_SIZE && offsetRef.current < (page.pagination?.total_count ?? Infinity));
    } catch (loadError) {
      if (requestId === requestRef.current) setError(loadError.message || 'Could not load GIPHY content.');
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [customerId, query, type]);

  useEffect(() => {
    if (!visible) return;
    seenIdsRef.current.clear();
    offsetRef.current = 0;
    setHasMore(true);
    load({ reset: true });
  }, [visible, type]);

  useEffect(() => {
    if (!visible) return undefined;
    const timeout = setTimeout(() => {
      offsetRef.current = 0;
      setHasMore(true);
      load({ reset: true });
    }, 350);
    return () => clearTimeout(timeout);
  }, [query]);

  const changeType = (nextType) => {
    if (nextType === type || !contentTypes.includes(nextType)) return;
    setType(nextType);
    setItems([]);
    setQuery('');
  };

  const selectItem = (item) => {
    Keyboard.dismiss();
    trackGiphyAction(item, 'onclick', customerId);
    onSelect?.(item);
  };

  const onViewableItemsChanged = useRef(({ changed }) => {
    changed.forEach(({ item, isViewable }) => {
      if (!isViewable || seenIdsRef.current.has(item.id)) return;
      seenIdsRef.current.add(item.id);
      trackGiphyAction(item, 'onload', customerId);
    });
  }).current;

  const renderItem = ({ item }) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Send ${item.altText}`}
      style={s.tile}
      onPress={() => selectItem(item)}
      activeOpacity={0.82}
    >
      <ExpoImage
        source={{ uri: item.previewUrl }}
        style={s.tileImage}
        contentFit="contain"
        transition={120}
        cachePolicy="none"
        accessibilityLabel={item.altText}
      />
    </TouchableOpacity>
  );

  const loadMore = () => {
    if (!loading && !loadingMore && hasMore) load();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>GIFs & Stickers</Text>
            <TouchableOpacity onPress={onClose} style={s.closeButton} accessibilityLabel="Close GIF picker">
              <Ionicons name="close" size={22} color={colors.graphite} />
            </TouchableOpacity>
          </View>

          {contentTypes.length > 1 ? (
            <View style={s.tabs}>
              <TouchableOpacity style={[s.tab, type === GIPHY_CONTENT_TYPES.GIF && s.tabActive]} onPress={() => changeType(GIPHY_CONTENT_TYPES.GIF)}>
                <Text style={[s.tabText, type === GIPHY_CONTENT_TYPES.GIF && s.tabTextActive]}>GIFs</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.tab, type === GIPHY_CONTENT_TYPES.STICKER && s.tabActive]} onPress={() => changeType(GIPHY_CONTENT_TYPES.STICKER)}>
                <Text style={[s.tabText, type === GIPHY_CONTENT_TYPES.STICKER && s.tabTextActive]}>Stickers</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={s.searchRow}>
            <Ionicons name="search" size={18} color={colors.ash} />
            <TextInput
              style={s.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${type === GIPHY_CONTENT_TYPES.GIF ? 'GIFs' : 'stickers'}…`}
              placeholderTextColor={colors.ash}
              autoCorrect={false}
              returnKeyType="search"
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear GIF search">
                <Ionicons name="close-circle" size={18} color={colors.ash} />
              </TouchableOpacity>
            ) : null}
          </View>

          {!hasGiphyApiKey() ? (
            <View style={s.stateWrap}>
              <Ionicons name="key-outline" size={28} color={colors.ember} />
              <Text style={s.stateTitle}>Add your GIPHY API key</Text>
              <Text style={s.stateText}>Set EXPO_PUBLIC_GIPHY_API_KEY in Hermez/.env, then restart Expo.</Text>
            </View>
          ) : loading && items.length === 0 ? (
            <View style={s.stateWrap}><ActivityIndicator color={colors.ember} /></View>
          ) : error ? (
            <View style={s.stateWrap}>
              <Text style={s.stateTitle}>Couldn’t load GIPHY</Text>
              <Text style={s.stateText}>{error}</Text>
              <TouchableOpacity style={s.retryButton} onPress={() => load({ reset: true })}><Text style={s.retryText}>Try again</Text></TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              numColumns={3}
              contentContainerStyle={s.grid}
              columnWrapperStyle={items.length ? s.gridRow : undefined}
              onEndReached={loadMore}
              onEndReachedThreshold={0.6}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<View style={s.stateWrap}><Text style={s.stateText}>No results found.</Text></View>}
              ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.ember} style={s.moreLoader} /> : null}
            />
          )}

          <Text style={s.attribution}>Powered by GIPHY</Text>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors, isDark) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { height: '76%', backgroundColor: isDark ? colors.snow : colors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden', paddingTop: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.fog, alignSelf: 'center', marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  title: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  closeButton: { padding: 7 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, marginTop: 10, marginBottom: 10 },
  tab: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.snow },
  tabActive: { backgroundColor: colors.ember },
  tabText: { color: colors.graphite, fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: colors.white },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 18, paddingHorizontal: 12, height: 42, borderRadius: 12, backgroundColor: colors.snow, borderWidth: 1, borderColor: colors.fog },
  searchInput: { flex: 1, color: colors.ink, fontSize: 15, height: '100%' },
  grid: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16 },
  gridRow: { gap: 8, marginBottom: 8 },
  tile: { flex: 1, aspectRatio: 1, maxWidth: '32%', backgroundColor: colors.snow, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tileImage: { width: '100%', height: '100%' },
  stateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 9 },
  stateTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  stateText: { color: colors.ash, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  retryButton: { backgroundColor: colors.ember, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8, marginTop: 4 },
  retryText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  moreLoader: { marginVertical: 12 },
  attribution: { color: colors.ash, fontSize: 11, fontWeight: '700', letterSpacing: 0.2, textAlign: 'center', paddingVertical: 9, borderTopWidth: 1, borderColor: colors.fog },
});
