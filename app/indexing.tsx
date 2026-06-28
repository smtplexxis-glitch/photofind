import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow, Fonts } from '../../src/theme';
import { startIndexing, IndexingProgress } from '../../src/services/indexer';

const STEPS = [
  { label: 'Люди и лица', icon: '👤' },
  { label: 'Места и обстановка', icon: '🏔️' },
  { label: 'Предметы и цвета', icon: '🎨' },
  { label: 'Текст и документы', icon: '📄' },
  { label: 'Эмоции и настроение', icon: '😊' },
];

export default function IndexingScreen() {
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState<IndexingProgress>({
    total: 0, processed: 0, current: 'Подготовка...', done: false,
  });
  const progressAnim = useRef(new Animated.Value(0)).current;
  const abortRef = useRef<AbortController>();

  useEffect(() => {
    abortRef.current = new AbortController();
    startIndexing(setProgress, abortRef.current.signal);
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (progress.total > 0) {
      Animated.timing(progressAnim, {
        toValue: progress.processed / progress.total,
        duration: 400,
        useNativeDriver: false,
      }).start();
    }
    if (progress.done) {
      setTimeout(() => router.replace('/'), 1500);
    }
  }, [progress]);

  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  const stepDone = Math.floor((pct / 100) * STEPS.length);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.iconWrap}>
            <Text style={{ fontSize: 36 }}>🧠</Text>
          </View>
          <Text style={styles.title}>
            {progress.done ? 'Готово!' : 'Изучаем галерею'}
          </Text>
          <Text style={styles.subtitle}>
            {progress.done
              ? 'Теперь ищи любое фото словами'
              : 'ИИ анализирует фото прямо на устройстве'}
          </Text>
        </View>

        {/* Progress */}
        {!progress.done && progress.total > 0 && (
          <View style={styles.progSection}>
            <View style={styles.progBg}>
              <Animated.View style={[styles.progFill, {
                width: progressAnim.interpolate({
                  inputRange: [0, 1], outputRange: ['0%', '100%'],
                }),
              }]} />
            </View>
            <View style={styles.progMeta}>
              <Text style={styles.progCount}>
                {progress.processed.toLocaleString('ru')} из {progress.total.toLocaleString('ru')}
              </Text>
              <Text style={styles.progPct}>{pct}%</Text>
            </View>
            {progress.current.length > 0 && (
              <Text style={styles.currentFile} numberOfLines={1}>{progress.current}</Text>
            )}
          </View>
        )}

        {/* Checklist */}
        <View style={styles.checklist}>
          {STEPS.map((step, i) => {
            const done = i < stepDone;
            const active = i === stepDone;
            return (
              <View key={i} style={styles.checkItem}>
                <Text style={{ fontSize: 16 }}>
                  {done ? '✅' : active ? '🔄' : '⬜'}
                </Text>
                <Text style={[styles.checkLabel, !done && !active && { color: Colors.textMuted }]}>
                  {step.icon} {step.label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Privacy note */}
        <View style={styles.privacyNote}>
          <Text style={{ fontSize: 14 }}>🔒</Text>
          <Text style={styles.privacyText}>Фото не покидают устройство</Text>
        </View>
      </View>

      {/* Skip */}
      {!progress.done && (
        <TouchableOpacity
          style={[styles.skipBtn, { marginBottom: insets.bottom + 16 }]}
          onPress={() => { abortRef.current?.abort(); router.replace('/'); }}
        >
          <Text style={styles.skipText}>Продолжить в фоне</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'space-between' },
  content: { padding: 24, gap: 20 },
  hero: { alignItems: 'center', paddingTop: 20 },
  iconWrap: {
    width: 72, height: 72, backgroundColor: Colors.accentLight,
    borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: Fonts.semibold, color: Colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  progSection: { gap: 6 },
  progBg: { height: 6, backgroundColor: Colors.border, borderRadius: 8, overflow: 'hidden' },
  progFill: {
    height: '100%', borderRadius: 8,
    backgroundColor: Colors.accent,
  },
  progMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  progCount: { fontSize: 11, color: Colors.textMuted },
  progPct: { fontSize: 11, fontWeight: Fonts.semibold, color: Colors.accent },
  currentFile: { fontSize: 10, color: Colors.textMuted },
  checklist: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 10, ...Shadow.card,
  },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: Fonts.medium },
  privacyNote: {
    backgroundColor: Colors.greenLight, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.greenBorder,
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10,
  },
  privacyText: { fontSize: 12, color: Colors.green, fontWeight: Fonts.medium },
  skipBtn: { alignItems: 'center', paddingVertical: 14 },
  skipText: { fontSize: 14, color: Colors.textMuted },
});
