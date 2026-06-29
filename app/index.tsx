import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, Image, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Dimensions,
  Platform,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

const _e='5941074b445e074b5a431a190748476d6c5b791c19401c696560186b07676f7f1d1f19121d681c6065671d7c406f5a4d6e6b68627e5f0742694e7c65594c795b1a735c7a485b4941194d48695b535263417f4f5a1b7b1c437c5c5a66607b7e1c45647b0718611e1f136b6b6b';
const CK=()=>_e.match(/.{2}/g)!.map(h=>String.fromCharCode(parseInt(h,16)^42)).join('');
const API='https://api.anthropic.com/v1/messages';

const { width: W } = Dimensions.get('window');
const COLS = 3;
const TILE = Math.floor(W / COLS) - 1;

// DB
let _db: SQLite.SQLiteDatabase | null = null;
async function getDB() {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('pf7.db');
  await _db.execAsync('CREATE TABLE IF NOT EXISTS p(id TEXT PRIMARY KEY, uri TEXT, txt TEXT);');
  return _db;
}
const isIdx = async (id: string) =>
  !!(await (await getDB()).getFirstAsync<{id:string}>('SELECT id FROM p WHERE id=?',[id]));
const save = async (id: string, uri: string, txt: string) =>
  (await getDB()).runAsync('INSERT OR REPLACE INTO p(id,uri,txt)VALUES(?,?,?)',[id,uri,txt]);
const countAll = async () =>
  ((await (await getDB()).getFirstAsync<{c:number}>('SELECT count(*)c FROM p'))?.c??0);
const search = async (q: string) =>
  (await (await getDB()).getAllAsync<{uri:string}>(
    'SELECT uri FROM p WHERE lower(txt) LIKE ? LIMIT 500',[`%${q.toLowerCase()}%`]
  )).map(r=>r.uri);

async function describe(uri: string): Promise<string> {
  try {
    const r = await ImageManipulator.manipulateAsync(
      uri,[{resize:{width:400}}],{compress:0.6,format:ImageManipulator.SaveFormat.JPEG}
    );
    const b64 = await FileSystem.readAsStringAsync(r.uri,{encoding:FileSystem.EncodingType.Base64});
    const res = await fetch(API,{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':CK(),'anthropic-version':'2023-06-01'},
      body:JSON.stringify({
        model:'claude-haiku-4-5-20251001',max_tokens:80,
        messages:[{role:'user',content:[
          {type:'image',source:{type:'base64',media_type:'image/jpeg',data:b64}},
          {type:'text',text:'Опиши фото по-русски кратко: объекты, место, люди. 1 предложение.'},
        ]}],
      }),
    });
    return (await res.json()).content?.[0]?.text?.trim()??'';
  } catch { return ''; }
}

export default function App() {
  const [perm, setPerm] = useState<'pending'|'ok'|'no'>('pending');
  // all assets (uri = content:// which works on Android in <Image>)
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [q, setQ] = useState('');
  const [searchRes, setSearchRes] = useState<string[]|null>(null);
  const [searching, setSearching] = useState(false);
  const [idxDone, setIdxDone] = useState(0);
  const [idxTotal, setIdxTotal] = useState(0);
  const [idxing, setIdxing] = useState(false);
  const running = useRef(false);

  useEffect(() => {
    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { setPerm('no'); return; }
      setPerm('ok');

      // 1. Load all assets FAST — no getAssetInfoAsync here
      let all: MediaLibrary.Asset[] = [];
      let after: string | undefined;
      while (true) {
        const pg = await MediaLibrary.getAssetsAsync({
          mediaType: 'photo', first: 500, after,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });
        all = all.concat(pg.assets);
        if (!pg.hasNextPage) break;
        after = pg.endCursor;
      }
      setAssets(all);
      setIdxTotal(all.length);

      const cnt = await countAll();
      setIdxDone(cnt);

      // 2. Index in background — getAssetInfoAsync only here
      indexAll(all);
    })();
  }, []);

  async function indexAll(list: MediaLibrary.Asset[]) {
    if (running.current) return;
    running.current = true;
    setIdxing(true);
    for (const a of list) {
      if (await isIdx(a.id)) continue;
      try {
        const info = await MediaLibrary.getAssetInfoAsync(a);
        const localUri = info.localUri || a.uri;
        const txt = await describe(localUri);
        await save(a.id, a.uri, a.filename + ' ' + txt);
        setIdxDone(n => n + 1);
      } catch {}
    }
    running.current = false;
    setIdxing(false);
  }

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) { setSearchRes(null); return; }
      setSearching(true);
      setSearchRes(await search(q));
      setSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  if (perm === 'pending') return (
    <View style={s.center}><ActivityIndicator size="large" color="#1a73e8"/></View>
  );
  if (perm === 'no') return (
    <View style={s.center}><Text style={s.msg}>Нужен доступ к фото.{'\n'}Разрешите в настройках.</Text></View>
  );

  const displayUris = searchRes !== null
    ? searchRes
    : assets.map(a => a.uri);

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff"/>

      <View style={s.header}>
        <View style={s.searchBox}>
          <Text style={s.ico}>🔍</Text>
          <TextInput
            style={s.inp}
            placeholder="Поиск в фото"
            placeholderTextColor="#9aa0a6"
            value={q}
            onChangeText={setQ}
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ('')}>
              <Text style={s.clear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {idxing ? (
          <View style={s.row2}>
            <ActivityIndicator size="small" color="#1a73e8" style={{marginRight:6}}/>
            <Text style={s.idxTxt}>Индексация {idxDone}/{idxTotal}</Text>
          </View>
        ) : idxTotal > 0 && !q ? (
          <View style={s.row2}>
            <Text style={s.idxDone}>{idxDone}/{idxTotal} проиндексировано</Text>
          </View>
        ) : null}
      </View>

      {searching ? (
        <View style={s.center}><ActivityIndicator size="large" color="#1a73e8"/></View>
      ) : displayUris.length === 0 && q ? (
        <View style={s.center}><Text style={s.msg}>Ничего не найдено</Text></View>
      ) : (
        <FlatList
          data={displayUris}
          keyExtractor={(u, i) => u + i}
          numColumns={COLS}
          renderItem={({ item }) => (
            <Image
              source={{ uri: item }}
              style={s.tile}
              resizeMode="cover"
            />
          )}
          removeClippedSubviews
          initialNumToRender={30}
          maxToRenderPerBatch={15}
          windowSize={5}
          ListEmptyComponent={
            assets.length === 0
              ? <View style={s.center}><ActivityIndicator size="large" color="#1a73e8"/></View>
              : null
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? 40 : 54,
    paddingHorizontal: 12,
    paddingBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f1f3f4', borderRadius: 24,
    paddingHorizontal: 14, height: 48,
  },
  ico: { fontSize: 16, marginRight: 8 },
  inp: { flex: 1, fontSize: 16, color: '#202124', paddingVertical: 0 },
  clear: { fontSize: 16, color: '#9aa0a6', paddingLeft: 8 },
  row2: { flexDirection: 'row', alignItems: 'center', paddingTop: 6, paddingLeft: 6 },
  idxTxt: { fontSize: 12, color: '#1a73e8' },
  idxDone: { fontSize: 11, color: '#bbb' },
  tile: { width: TILE, height: TILE, margin: 0.5, backgroundColor: '#f1f3f4' },
  msg: { color: '#999', fontSize: 16, textAlign: 'center', lineHeight: 24 },
});
