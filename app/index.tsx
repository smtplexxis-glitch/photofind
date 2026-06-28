import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, StatusBar, Keyboard,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow, Fonts } from '../src/theme';
import { getIndexedCount } from '../src/services/db';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENT_KEY = 'recent_queries';
const MAX_RECENT = 5;

const CATEGORIES = [
  { label: 'Люди', icon: '👤', color: Colors.accentLight, count: null },
  { label: 'Места', icon: '📍', color: Colors.greenLight, count: null },
  { label: 'Документы', icon: '📄', color: Colors.amberLight, count: null },
  { label: 'События', icon: '🎉', color: Colors.pinkLight, count: null },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [indexedCount, setIndexedCount] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    getIndexedCount().then(setIndexedCount);
    AsyncStorage.getItem(RECENT_KEY).then(v => {
      if (v) setRecent(JSON.parse(v));
    });
  }, []);

  const handleSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    // Save to recent
    const updated = [trimmed, ...recent.filter(r => r !== trimmed)].slice(0, MAX_RECENT);
    setRecent(updated);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    router.push({ pathname: '/results', params: { query: trimmed } });
  }, [recent]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>Photo<Text style={styles.logoAccent}>Find</Text></Text>
            {indexedCount > 0 && (
              <Text style={styles.subtitle}>{indexedCount.toLocaleString('ru')} фото проиндексировано</Text>
            )}
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/settings')}>
            <Text style={{ fontSize: 18 }}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Search box */}
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>✨</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Опиши фото словами…"
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => handleSearch(query)}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Text style={{ color: Colors.textMuted, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Recent */}
        {recent.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>НЕДАВНИЕ</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {recent.map((r, i) => (
                <TouchableOpacity key={i} style={styles.chip} onPress={() => handleSearch(r)}>
                  <Text style={styles.chipText}>🕐 {r}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Categories */}
        <Text style={styles.sectionLabel}>КАТЕГОРИИ</Text>
        <View style={styles.catGrid}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.label}
              style={[styles.catCard, { backgroundColor: cat.color }]}
              onPress={() => handleSearch(cat.label.toLowerCase())}
            >
              <Text style={{ fontSize: 22, marginBottom: 8 }}>{cat.icon}</Text>
              <Text style={styles.catTitle}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Ad banner placeholder */}
        <View style={styles.adBanner}>
          <Text style={styles.adText}>реклама</Text>
        </View>

        <View style={{ height: insets.bottom + 16 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
  },
  logo: { fontSize: 26, fontWeight: Fonts.semibold, color: Colors.text, letterSpacing: -0.5 },
  logoAccent: { color: Colors.accent },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  iconBtn: {
    width: 36, height: 36, backgroundColor: Colors.surface,
    borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginVertical: 10,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    ...Shadow.card,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: {
    flex: 1, fontSize: 14, color: Colors.text,
    fontWeight: Fonts.regular,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: Fonts.semibold, color: Colors.textMuted,
    letterSpacing: 0.8, marginLeft: 20, marginTop: 16, marginBottom: 8,
  },
  chipsRow: { paddingHorizontal: 20, gap: 8 },
  chip: {
    backgroundColor: Colors.surface, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  chipText: { fontSize: 12, color: Colors.textSecondary },
  catGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 20, gap: 10,
  },
  catCard: {
    width: '47%', borderRadius: Radius.lg,
    padding: 14, ...Shadow.card,
  },
  catTitle: { fontSize: 13, fontWeight: Fonts.medium, color: Colors.textSecondary },
  adBanner: {
    marginHorizontal: 20, marginTop: 20, height: 50,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  adText: { fontSize: 10, color: Colors.textMuted },
});
