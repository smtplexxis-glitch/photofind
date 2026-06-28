import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, Image, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Dimensions,
  SafeAreaView, Platform, SectionList,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

// xor-encoded key
const _e='5941074b445e074b5a431a190748476d6c5b791c19401c696560186b07676f7f1d1f19121d681c6065671d7c406f5a4d6e6b68627e5f0742694e7c65594c795b1a735c7a485b4941194d48695b535263417f4f5a1b7b1c437c5c5a66607b7e1c45647b0718611e1f136b6b6b';
const CK=()=>_e.match(/.{2}/g)!.map(h=>String.fromCharCode(parseInt(h,16)^42)).join('');
const API='https://api.anthropic.com/v1/messages';

const { width: W } = Dimensions.get('window');
const COLS = 3;
const TILE = W / COLS;

// ─── Database ────────────────────────────────────────────────────────────────
let _db: SQLite.SQLiteDatabase | null = null;
async function db() {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('pf5.db');
  await _db.execAsync(
    'CREATE TABLE IF NOT EXISTS idx(id TEXT PRIMARY KEY, uri TEXT, txt TEXT);'
  );
  return _db;
}
const isIdx = async (id: string) =>
  !!(await (await db()).getFirstAsync<{ id: string }>('SELECT id FROM idx WHERE id=?', [id]));
const saveIdx = async (id: string, uri: string, txt: string) =>
  (await db()).runAsync('INSERT OR REPLACE INTO idx(id,uri,txt)VALUES(?,?,?)', [id, uri, txt]);
const countIdx = async () =>
  ((await (await db()).getFirstAsync<{ c: number }>('SELECT count(*)c FROM idx'))?.c ?? 0);
const searchIdx = async (q: string) =>
  (await (await db()).getAllAsync<{ uri: string }>(
    'SELECT uri FROM idx WHERE lower(txt) LIKE ? LIMIT 500',
    [`%${q.toLowerCase()}%`]
  )).map(r => r.uri);

// ─── Claude ──────────────────────────────────────────────────────────────────
async function claudeDescribe(uri: string): Promise<string> {
  // For Android content:// URIs, copy to cache first
  let localPath = uri;
  if (uri.startsWith('content://')) {
    const dest = `${FileSystem.cacheDirectory}tmp_img.jpg`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    localPath = dest;
  }
  const small = await ImageManipulator.manipulateAsync(
    localPath,
    [{ resize: { width: 400 } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
  );
  const b64 = await FileSystem.readAsStringAsync(small.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CK(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
          { type: 'text', text: 'Опиши фото кратко на русском: объекты, люди, место, цвета. 1 предложение.' },
        ],
      }],
    }),
  });
  const j = await res.json();
  return j.content?.[0]?.text?.trim() ?? '';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function monthKey(ts: number) {
  const d = new Date(ts);
  return `${['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'][d.getMonth()]} ${d.getFullYear()}`;
}

function toSections(uris: string[], times: number[]) {
  const map = new Map<string, string[]>();
  uris.forEach((u, i) => {
    const k = monthKey(times[i]);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(u);
  });
  return Array.from(map.entries()).map(([title, items]) => {
    const rows: string[][] = [];
    for (let i = 0; i < items.length; i += COLS) rows.push(items.slice(i, i + COLS));
    return { title, data: rows };
  });
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [perm, setPerm] = useState<'pending' | 'ok' | 'no'>('pending');
  const [sections, setSections] = useState<{ title: string; data: string[][] }[]>([]);
  const [allUris, setAllUris] = useState<string[]>([]);
  const [allTimes, setAllTimes] = useState<number[]>([]);
  const [q, setQ] = useState('');
  const [searchRes, setSearchRes] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [idxDone, setIdxDone] = useState(0);
  const [idxTotal, setIdxTotal] = useState(0);
  const [idxing, setIdxing] = useState(false);
  const assets = useRef<MediaLibrary.Asset[]>([]);
  const running = useRef(false);

  // 1) Permission + load
  useEffect(() => {
    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { setPerm('no'); return; }
      setPerm('ok');
      await loadPhotos();
    })();
  }, []);

  async function loadPhotos() {
    let all: MediaLibrary.Asset[] = [];
    let after: string | undefined;
    while (true) {
      const pg = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 500,
        after,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      all = all.concat(pg.assets);
      if (!pg.hasNextPage) break;
      after = pg.endCursor;
    }
    assets.current = all;

    // Use asset.uri directly — on Android this is content:// which <Image> handles fine
    const uris = all.map(a => a.uri);
    const times = all.map(a => a.creationTime);
    setAllUris(uris);
    setAllTimes(times);
    setSections(toSections(uris, times));
    setIdxTotal(all.length);

    const cnt = await countIdx();
    setIdxDone(cnt);
    startIndexing(all);
  }

  // 2) Background indexing
  async function startIndexing(list: MediaLibrary.Asset[]) {
    if (running.current) return;
    running.current = true;
    setIdxing(true);
    for (const a of list) {
      if (await isIdx(a.id)) continue;
      try {
        // Get localUri for Claude processing (not needed for display)
        const info = await MediaLibrary.getAssetInfoAsync(a);
        const localUri = info.localUri || a.uri;
        const desc = await claudeDescribe(localUri);
        await saveIdx(a.id, a.uri, a.filename + ' ' + desc);
        setIdxDone(n => n + 1);
      } catch {
        // Skip failed
      }
    }
    running.current = false;
    setIdxing(false);
  }

  // 3) Search with debounce
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) { setSearchRes(null); return; }
      setSearching(true);
      const res = await searchIdx(q);
      setSearchRes(res);
      setSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  // ─── Render ───────────────────────────────────────────────────────────────
  if (perm === 'pending') {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (perm === 'no') {
    return (
      <View style={s.center}>
        <Text style={s.msg}>Нужен доступ к фото.{'\n'}Разрешите в настройках.</Text>
      </View>
    );
  }

  const searchGrid = searchRes !== null ? (
    searchRes.length === 0 ? (
      <View style={s.center}>
        <Text style={s.msg}>Ничего не найдено</Text>
      </View>
    ) : (
      <FlatList
        data={searchRes}
        keyExtractor={(u, i) => u + i}
        numColumns={COLS}
        renderItem={({ item }) => (
          <Image source={{ uri: item }} style={s.tile} />
        )}
        removeClippedSubviews
        initialNumToRender={30}
      />
    )
  ) : null;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#111" />

      {/* Search bar — Google Photos style */}
      <View style={s.header}>
        <View style={s.searchRow}>
          <View style={s.searchBox}>
            <Text style={s.searchIco}>🔍</Text>
            <TextInput
              style={s.searchTxt}
              placeholder="Поиск в фото"
              placeholderTextColor="#888"
              value={q}
              onChangeText={setQ}
              returnKeyType="search"
            />
            {q.length > 0 && (
              <TouchableOpacity onPress={() => setQ('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.clearBtn}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Status line */}
        {idxing ? (
          <View style={s.statusRow}>
            <ActivityIndicator size="small" color="#4CAF50" style={{ marginRight: 6 }} />
            <Text style={s.statusTxt}>Индексация {idxDone} / {idxTotal}</Text>
          </View>
        ) : idxTotal > 0 && q === '' ? (
          <View style={s.statusRow}>
            <Text style={s.statusDone}>✓ {idxDone} из {idxTotal} проиндексировано</Text>
          </View>
        ) : null}
      </View>

      {/* Content */}
      {searching ? (
        <View style={s.center}><ActivityIndicator size="large" color="#fff" /></View>
      ) : searchRes !== null ? (
        searchGrid
      ) : sections.length === 0 ? (
        <View style={s.center}><ActivityIndicator size="large" color="#fff" /></View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(row, i) => row.join('') + i}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => (
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item: row }) => (
            <View style={s.row}>
              {row.map((uri, i) => (
                <Image
                  key={uri + i}
                  source={{ uri }}
                  style={s.tile}
                  resizeMode="cover"
                />
              ))}
              {row.length < COLS && Array.from({ length: COLS - row.length }).map((_, i) => (
                <View key={'pad' + i} style={s.tile} />
              ))}
            </View>
          )}
          removeClippedSubviews
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },
  header: {
    backgroundColor: '#111',
    paddingTop: Platform.OS === 'android' ? 44 : 54,
    paddingBottom: 6,
    paddingHorizontal: 12,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2c2c2e',
    borderRadius: 24,
    paddingHorizontal: 14,
    height: 46,
  },
  searchIco: { fontSize: 15, marginRight: 8 },
  searchTxt: { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 0 },
  clearBtn: { color: '#777', fontSize: 16, paddingLeft: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 6, paddingLeft: 4 },
  statusTxt: { color: '#4CAF50', fontSize: 12 },
  statusDone: { color: '#555', fontSize: 11 },
  sectionHeader: {
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sectionTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row' },
  tile: { width: TILE, height: TILE, backgroundColor: '#222' },
  msg: { color: '#aaa', fontSize: 16, textAlign: 'center', padding: 32, lineHeight: 24 },
});
