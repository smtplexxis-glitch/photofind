import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, ActivityIndicator, FlatList, Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow, Fonts } from '../../src/theme';
import { searchPhotos, SearchResult } from '../../src/services/db';
import { parseSearchQuery } from '../../src/services/claude';

const { width } = Dimensions.get('window');
const COLS = 3;
const GAP = 3;
const CELL = (width - 40 - GAP * (COLS - 1)) / COLS;

export default function ResultsScreen() {
  const insets = useSafeAreaInsets();
  const { query } = useLocalSearchParams<{ query: string }>();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!query) return;
    const start = Date.now();
    setLoading(true);

    parseSearchQuery(query)
      .then(keywords => searchPhotos(keywords))
      .then(rows => {
        setResults(rows);
        setElapsed(Date.now() - start);
      })
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={{ fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.queryText} numberOfLines={1}>{query}</Text>
      </View>

      {/* AI info row */}
      {!loading && (
        <View style={styles.aiRow}>
          <View style={styles.aiDot} />
          <Text style={styles.aiText}>
            {results.length > 0
              ? `Найдено ${results.length} фото · ${(elapsed / 1000).toFixed(1)} сек`
              : 'Ничего не найдено'}
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>ИИ ищет фото…</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>🔍</Text>
          <Text style={styles.emptyTitle}>Фото не найдены</Text>
          <Text style={styles.emptyText}>Попробуй другие слова или проверь что галерея проиндексирована</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          numColumns={COLS}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: GAP }}
          ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[styles.cell, index < 3 && styles.cellMatch]}
              onPress={() => router.push({ pathname: '/photo', params: { uri: item.uri, description: item.description } })}
            >
              <Image source={{ uri: item.uri }} style={styles.cellImage} />
              {index < 3 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{Math.round(90 - index * 5)}%</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8,
  },
  backBtn: {
    width: 34, height: 34, backgroundColor: Colors.surface,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  queryText: {
    flex: 1, fontSize: 15, fontWeight: Fonts.medium, color: Colors.text,
  },
  aiRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 10,
    backgroundColor: Colors.accentLight, borderRadius: Radius.md, padding: 8,
  },
  aiDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  aiText: { fontSize: 12, color: Colors.accent, fontWeight: Fonts.medium },
  grid: { paddingHorizontal: 20, paddingBottom: 40 },
  cell: { width: CELL, height: CELL, borderRadius: Radius.md, overflow: 'hidden' },
  cellMatch: { borderWidth: 2, borderColor: Colors.accent },
  cellImage: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: Colors.accent, borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  badgeText: { fontSize: 9, color: '#fff', fontWeight: Fonts.semibold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingText: { fontSize: 14, color: Colors.textMuted, marginTop: 12 },
  emptyTitle: { fontSize: 16, fontWeight: Fonts.medium, color: Colors.text, marginTop: 12 },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
