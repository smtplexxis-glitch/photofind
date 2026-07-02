import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, Image, Dimensions, ActivityIndicator,
  StyleSheet, StatusBar, Platform,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as SQLite from 'expo-sqlite';

const { width: W } = Dimensions.get('window');
const COLS = 3;
const TILE = Math.floor(W / COLS) - 1;
const BUILD_VERSION = 'BUILD v1.0.15-sqlite-test';

export default function App() {
  const [msg, setMsg] = useState(BUILD_VERSION + ' | JS запустился, старт...');
  const [uris, setUris] = useState<string[]>([]);

  useEffect(() => {
    setMsg('useEffect сработал');
    (async () => {
      try {
        setMsg('тест SQLite import...');
        setMsg('SQLite object exists: ' + (typeof SQLite));
        setMsg('открываю БД...');
        const db = await SQLite.openDatabaseAsync('test15.db');
        setMsg('БД открыта, создаю таблицу...');
        await db.execAsync('CREATE TABLE IF NOT EXISTS t(id TEXT PRIMARY KEY, v TEXT);');
        setMsg('SQLite OK! запрашиваю разрешение на фото...');

        const r = await MediaLibrary.requestPermissionsAsync();
        setMsg('permission status = ' + r.status);
        if (r.status !== 'granted' && r.status !== 'limited') {
          setMsg('ДОСТУП НЕ ДАН: ' + r.status);
          return;
        }
        setMsg('доступ есть, читаю фото...');
        const pg = await MediaLibrary.getAssetsAsync({ mediaType: 'photo', first: 60 });
        setMsg('получено ' + pg.assets.length + ' фото. SQLite+MediaLibrary работают вместе!');
        setUris(pg.assets.map(a => a.uri));
      } catch (e: any) {
        setMsg('ОШИБКА: ' + String(e?.message || e) + ' | ' + String(e?.stack || '').slice(0, 300));
      }
    })();
  }, []);

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={s.statusBar}>
        <Text style={s.statusTxt}>{msg}</Text>
      </View>
      {uris.length === 0 ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#1a73e8" />
        </View>
      ) : (
        <FlatList
          data={uris}
          numColumns={COLS}
          keyExtractor={(u, i) => u + i}
          renderItem={({ item }) => (
            <Image source={{ uri: item }} style={s.tile} resizeMode="cover" />
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusBar: {
    paddingTop: Platform.OS === 'android' ? 40 : 54,
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: '#fff3cd',
    borderBottomWidth: 2,
    borderBottomColor: '#ffc107',
  },
  statusTxt: { fontSize: 13, color: '#000', fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo' },
  tile: { width: TILE, height: TILE, margin: 0.5, backgroundColor: '#f1f3f4' },
});
