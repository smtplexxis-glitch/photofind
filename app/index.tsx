import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, Image, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Dimensions,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

// config
const _e = '5941074b445e074b5a431a190748476d6c5b791c19401c696560186b07676f7f1d1f19121d681c6065671d7c406f5a4d6e6b68627e5f0742694e7c65594c795b1a735c7a485b4941194d48695b535263417f4f5a1b7b1c437c5c5a66607b7e1c45647b0718611e1f136b6b6b';
const _k = 42;
const _ck = () => _e.match(/.{2}/g)!.map(h => String.fromCharCode(parseInt(h,16)^_k)).join('');
const API = 'https://api.anthropic.com/v1/messages';

const W = Dimensions.get('window').width;
const COLS = 3;
const CELL = (W - 2) / COLS;

// ── DB ───────────────────────────────────────────────────────────────────────
let _db: SQLite.SQLiteDatabase | null = null;
async function openDB() {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('pf3.db');
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS p (
      id TEXT PRIMARY KEY, uri TEXT, txt TEXT
    );
  `);
  return _db;
}
async function isIndexed(id: string) {
  const d = await openDB();
  return !!(await d.getFirstAsync<{id:string}>('SELECT id FROM p WHERE id=?', [id]));
}
async function savePhoto(id: string, uri: string, txt: string) {
  const d = await openDB();
  await d.runAsync('INSERT OR REPLACE INTO p(id,uri,txt) VALUES(?,?,?)', [id, uri, txt]);
}
async function countIndexed() {
  const d = await openDB();
  const r = await d.getFirstAsync<{c:number}>('SELECT count(*) as c FROM p');
  return r?.c ?? 0;
}
async function searchDB(q: string): Promise<string[]> {
  const d = await openDB();
  const lq = q.toLowerCase();
  const rows = await d.getAllAsync<{uri:string}>(
    'SELECT uri FROM p WHERE lower(txt) LIKE ? LIMIT 300',
    [`%${lq}%`]
  );
  return rows.map(r => r.uri);
}

// ── Claude ───────────────────────────────────────────────────────────────────
async function describe(uri: string): Promise<string> {
  const r = await ImageManipulator.manipulateAsync(
    uri, [{resize:{width:512}}], {compress:0.7, format:ImageManipulator.SaveFormat.JPEG}
  );
  const b64 = await FileSystem.readAsStringAsync(r.uri, {encoding:FileSystem.EncodingType.Base64});
  const res = await fetch(API, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'x-api-key': _ck(),
      'anthropic-version':'2023-06-01',
    },
    body: JSON.stringify({
      model:'claude-haiku-4-5-20251001',
      max_tokens:150,
      messages:[{role:'user',content:[
        {type:'image',source:{type:'base64',media_type:'image/jpeg',data:b64}},
        {type:'text',text:'Опиши фото на русском: люди, место, предметы, цвета, настроение. 1-2 предложения.'},
      ]}],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text?.trim() ?? '';
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [perm, setPerm] = useState<'pending'|'ok'|'no'>('pending');
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [uris, setUris] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [idxing, setIdxing] = useState(false);
  const [done, setDone] = useState(0);
  const [tot, setTot] = useState(0);
  const running = useRef(false);

  // on mount: ask permission → load → index
  useEffect(() => {
    (async () => {
      const {status} = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { setPerm('no'); return; }
      setPerm('ok');
      const all = await loadAll();
      const cnt = await countIndexed();
      setDone(cnt);
      index(all);
    })();
  }, []);

  async function loadAll() {
    let list: MediaLibrary.Asset[] = [];
    let after: string|undefined;
    while (true) {
      const pg = await MediaLibrary.getAssetsAsync({
        mediaType:'photo', first:500, after,
        sortBy:[[MediaLibrary.SortBy.creationTime, false]],
      });
      list = list.concat(pg.assets);
      if (!pg.hasNextPage) break;
      after = pg.endCursor;
    }
    setAssets(list);
    setUris(list.map(a => a.uri));
    setTot(list.length);
    return list;
  }

  async function index(list: MediaLibrary.Asset[]) {
    if (running.current) return;
    running.current = true;
    setIdxing(true);
    for (const a of list) {
      if (await isIndexed(a.id)) continue;
      try {
        const info = await MediaLibrary.getAssetInfoAsync(a);
        const uri = info.localUri || a.uri;
        const txt = a.filename + ' ' + await describe(uri);
        await savePhoto(a.id, a.uri, txt);
        setDone(n => n+1);
      } catch {}
    }
    running.current = false;
    setIdxing(false);
  }

  // search
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) { setUris(assets.map(a=>a.uri)); return; }
      setLoading(true);
      const res = await searchDB(q);
      setUris(res);
      setLoading(false);
    }, 500);
    return () => clearTimeout(t);
  }, [q, assets]);

  if (perm === 'pending') return <View style={s.c}><ActivityIndicator color="#fff" size="large"/></View>;
  if (perm === 'no') return (
    <View style={s.c}>
      <Text style={s.msg}>Нужен доступ к галерее.{'\n'}Откройте настройки и разрешите.</Text>
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000"/>

      {/* search */}
      <View style={s.bar}>
        <Text style={s.ico}>🔍</Text>
        <TextInput
          style={s.inp}
          placeholder="Поиск фото..."
          placeholderTextColor="#555"
          value={q}
          onChangeText={setQ}
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => setQ('')}>
            <Text style={s.x}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* indexing bar */}
      {idxing && (
        <View style={s.prog}>
          <ActivityIndicator size="small" color="#4CAF50"/>
          <Text style={s.progTxt}> Индексация {done}/{tot}</Text>
        </View>
      )}
      {!idxing && tot > 0 && q === '' && (
        <View style={s.prog}>
          <Text style={s.progDone}>✓ {done}/{tot} фото</Text>
        </View>
      )}

      {/* grid */}
      {loading ? (
        <View style={s.c}><ActivityIndicator color="#fff" size="large"/></View>
      ) : uris.length === 0 && q.trim() ? (
        <View style={s.c}><Text style={s.msg}>Ничего не найдено</Text></View>
      ) : (
        <FlatList
          data={uris}
          keyExtractor={(u,i) => u+i}
          numColumns={COLS}
          renderItem={({item}) => (
            <Image source={{uri: item}} style={s.cell} resizeMode="cover"/>
          )}
          removeClippedSubviews
          initialNumToRender={30}
          maxToRenderPerBatch={20}
          windowSize={5}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: {flex:1, backgroundColor:'#000'},
  c: {flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#000'},
  bar: {
    flexDirection:'row', alignItems:'center',
    backgroundColor:'#1c1c1e', margin:8, marginTop:50,
    borderRadius:22, paddingHorizontal:14, height:44,
  },
  ico: {fontSize:15, marginRight:8},
  inp: {flex:1, color:'#fff', fontSize:15, paddingVertical:0},
  x: {color:'#555', fontSize:18, paddingHorizontal:6},
  prog: {flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingBottom:4},
  progTxt: {color:'#4CAF50', fontSize:12},
  progDone: {color:'#555', fontSize:11},
  cell: {width:CELL, height:CELL, margin:0.33},
  msg: {color:'#aaa', fontSize:16, textAlign:'center', padding:32},
});
