import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  Dimensions, Share,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Fonts } from '../src/theme';

const { width, height } = Dimensions.get('window');

export default function PhotoScreen() {
  const insets = useSafeAreaInsets();
  const { uri, description } = useLocalSearchParams<{ uri: string; description: string }>();

  const handleShare = async () => {
    await Share.share({ url: uri });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <TouchableOpacity style={[styles.closeBtn, { top: insets.top + 10 }]} onPress={() => router.back()}>
        <Text style={{ color: '#fff', fontSize: 18 }}>✕</Text>
      </TouchableOpacity>

      <Image source={{ uri }} style={styles.image} resizeMode="contain" />

      <View style={styles.footer}>
        {description ? (
          <Text style={styles.desc}>{description}</Text>
        ) : null}
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.btnPrimary} onPress={handleShare}>
            <Text style={styles.btnPrimaryText}>Поделиться</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => router.back()}>
            <Text style={styles.btnSecondaryText}>Назад</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f0f0f' },
  closeBtn: {
    position: 'absolute', right: 16, zIndex: 10,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  image: { flex: 1, width },
  footer: {
    backgroundColor: 'rgba(0,0,0,0.6)', padding: 20, gap: 12,
  },
  desc: { fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 20 },
  btnRow: { flexDirection: 'row', gap: 10 },
  btnPrimary: {
    flex: 1, backgroundColor: Colors.accent,
    borderRadius: Radius.md, padding: 13, alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: Fonts.semibold },
  btnSecondary: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.md, padding: 13, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  btnSecondaryText: { color: '#fff', fontSize: 14, fontWeight: Fonts.medium },
});
