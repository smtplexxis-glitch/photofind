import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Radius, Shadow, Fonts } from '../src/theme';
import { getIndexedCount } from '../src/services/db';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [apiKey, setApiKey] = useState('');
  const [count, setCount] = useState(0);

  React.useEffect(() => {
    AsyncStorage.getItem('claude_api_key').then(k => { if (k) setApiKey(k); });
    getIndexedCount().then(setCount);
  }, []);

  const save = async () => {
    await AsyncStorage.setItem('claude_api_key', apiKey);
    Alert.alert('Сохранено');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={{ fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Настройки</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Claude API ключ</Text>
          <Text style={styles.cardSub}>Нужен для умного поиска. Получи на console.anthropic.com</Text>
          <TextInput
            style={styles.input}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="sk-ant-..."
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
          />
          <TouchableOpacity style={styles.btn} onPress={save}>
            <Text style={styles.btnText}>Сохранить</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Индексация</Text>
          <Text style={styles.cardSub}>{count.toLocaleString('ru')} фото проиндексировано</Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: Colors.accentLight }]}
            onPress={() => router.push('/indexing')}
          >
            <Text style={[styles.btnText, { color: Colors.accent }]}>Переиндексировать</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Конфиденциальность</Text>
          <Text style={styles.cardSub}>
            Фото анализируются локально с помощью ИИ. В Claude API отправляются только сжатые копии
            для получения описания. Ключ хранится только на устройстве.
          </Text>
        </View>
      </ScrollView>
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
  title: { fontSize: 18, fontWeight: Fonts.semibold, color: Colors.text },
  content: { padding: 20, gap: 16 },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 8, ...Shadow.card,
  },
  cardTitle: { fontSize: 14, fontWeight: Fonts.semibold, color: Colors.text },
  cardSub: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  input: {
    backgroundColor: Colors.bg, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: 10, fontSize: 13, color: Colors.text, marginTop: 4,
  },
  btn: {
    backgroundColor: Colors.accent, borderRadius: Radius.md,
    padding: 12, alignItems: 'center', marginTop: 4,
  },
  btnText: { fontSize: 13, fontWeight: Fonts.semibold, color: '#fff' },
});
