import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, Image, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Dimensions,
  SectionList, Platform, SafeAreaView,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

// xor key
const _e='5941074b445e074b5a431a190748476d6c5b791c19401c696560186b07676f7f1d1f19121d681c6065671d7c406f5a4d6e6b68627e5f0742694e7c65594c795b1a735c7a485b4941194d48695b535263417f4f5a1b7b1c437c5c5a66607b7e1c45647b0718611e1f136b6b6b';
const CK=()=>_e.match(/.{2}/g)!.map(h=>String.fromCharCode(parseInt(h,16)^42)).join('');
const API='https://api.anthropic.com/v1/messages';

const { width: W } = Dimensions.get('window');
const COLS = 3;
const GAP = 2;
const TILE = (W - GAP * (COLS + 1)) / COLS;

// DB
let _db: SQLite.SQLiteDatabase | null = null;
async function getDB() {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('pf6.db');
  await _db.execAsync('CREATE TABLE IF NOT EXISTS p(id TEXT PRIMARY KEY, uri TEXT, txt TEXT);');
  return _db;
}
const isIdx = async (id: string) =>
  !!(await (await getDB()).getFirstAsync<{id:string}>('SELECT id FROM p WHERE id=?',[id]));
const savePhoto = async (id: string, uri: string, txt: string) =>
  (await getDB()).runAsync('INSERT OR REPLACE INTO p(id,uri,txt)VALUES(?,?,?)',[id,uri,txt]);
const countAll = async () =>
  ((await (await getDB()).getFirstAsync<{c:number}>('SELECT count(*)c FROM p'))?.c??0);
const doSearch = async (q: string) =>
  (await (await getDB()).getAllAsync<{uri:string}>(
    'SELECT uri FROM p WHERE lower(txt) LIKE ? LIMIT 500',[`%${q.toLowerCase()}%`]
  )).map(r=>r.uri);

// Claude
async function claudeDescribe(localUri: string): Promise<string> {
  try {
    const small = await ImageManipulator.manipulateAsync(
      localUri,[{resize:{width:400}}],{compress:0.6,format:ImageManipulator.SaveFormat.JPEG}
    );
    const b64 = await FileSystem.readAsStringAsync(small.uri,{encoding:FileSystem.EncodingType.Base64});
    const res = await fetch(API,{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':CK(),'anthropic-version':'2023-06-01'},
      body:JSON.stringify({
        model:'claude-haiku-4-5-20251001',max_tokens:80,
        messages:[{role:'user',content:[
          {type:'image',source:{type:'base64',media_type:'image/jpeg',data:b64}},
          {type:'text',text:'Опиши фото кратко по-русски: объекты, место, люди. 1 предложение.'},
        ]}],
      }),
    });
    const j = await res.json();
    return j.content?.[0]?.text?.trim()??'';
  } catch { return ''; }
}

function monthLabel(ts: number) {
  const d = new Date(ts);
  const m=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'][d.getMonth()];
  return `${m} ${d.getFullYear()}`;
}

type Photo = { id: string; uri: string; localUri: string; ts: number; filename: string };

export default function App() {
  const [perm, setPerm] = useState<'pending'|'ok'|'no'>('pending');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sections, setSections] = useState<{title:string;data:Photo[][]}[]>([]);
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
      load();
    })();
  }, []);

  async function load() {
    let all: Photo[] = [];
    let after: string | undefined;
    while (true) {
      const pg = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo', first: 200, after,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      for (const a of pg.assets) {
        // get localUri which works reliably on Android
        const info = await MediaLibrary.getAssetInfoAsync(a);
        all.push({
          id: a.id,
          uri: a.uri,
          localUri: info.localUri || a.uri,
          ts: a.creationTime,
          filename: a.filename,
        });
      }
      if (!pg.hasNextPage) break;
      after = pg.endCursor;
    }
    setPhotos(all);
    setIdxTotal(all.length);
    buildSections(all);
    const cnt = await countAll();
    setIdxDone(cnt);
    index(all);
  }

  function buildSections(list: Photo[]) {
    const map = new Map<string, Photo[]>();
    for (const p of list) {
      const k = monthLabel(p.ts);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    const secs: {title:string;data:Photo[][]}[] = [];
    map.forEach((items, title) => {
      const rows: Photo[][] = [];
      for (let i = 0; i < items.length; i += COLS) rows.push(items.slice(i, i+COLS));
      secs.push({ title, data: rows });
    });
    setSections(secs);
  }

  async function index(list: Photo[]) {
    if (running.current) return;
    running.current = true;
    setIdxing(true);
    for (const p of list) {
      if (await isIdx(p.id)) continue;
      const desc = await claudeDescribe(p.localUri);
      await savePhoto(p.id, p.localUri, p.filename + ' ' + desc);
      setIdxDone(n => n + 1);
    }
    running.current = false;
    setIdxing(false);
  }

  // search
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) { setSearchRes(null); return; }
      setSearching(true);
      const uris = await doSearch(q);
      setSearchRes(uris);
      setSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  if (perm === 'pending') return (
    <View style={s.center}><ActivityIndicator size="large" color="#1a73e8"/></View>
  );
  if (perm === 'no') return (
    <View style={s.center}>
      <Text style={s.noPermText}>Нет доступа к фото.{'\n'}Разрешите в настройках.</Text>
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff"/>

      {/* Header */}
      <View style={s.header}>
        <View style={s.searchBox}>
          <Text style={s.searchIco}>🔍</Text>
          <TextInput
            style={s.searchInput}
            placeholder="Поиск в фото"
            placeholderTextColor="#999"
            value={q}
            onChangeText={setQ}
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ('')} hitSlop={{top:8,bottom:8,left:8,right:8}}>
              <Text style={s.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        {idxing ? (
          <View style={s.statusRow}>
            <ActivityIndicator size="small" color="#1a73e8" style={{marginRight:6}}/>
            <Text style={s.statusText}>Индексация {idxDone}/{idxTotal}</Text>
          </View>
        ) : idxTotal > 0 && q === '' ? (
          <View style={s.statusRow}>
            <Text style={s.statusDone}>✓ {idxDone}/{idxTotal} проиндексировано</Text>
          </View>
        ) : null}
      </View>

      {/* Content */}
      {searching ? (
        <View style={s.center}><ActivityIndicator size="large" color="#1a73e8"/></View>
      ) : searchRes !== null ? (
        searchRes.length === 0 ? (
          <View style={s.center}><Text style={s.emptyText}>Ничего не найдено</Text></View>
        ) : (
          <FlatList
            data={searchRes}
            keyExtractor={(u,i) => u+i}
            numColumns={COLS}
            contentContainerStyle={{padding: GAP}}
            renderItem={({item}) => (
              <Image
                source={{uri: item}}
                style={s.tile}
                resizeMode="cover"
              />
            )}
            removeClippedSubviews initialNumToRender={30}
          />
        )
      ) : sections.length === 0 ? (
        <View style={s.center}><ActivityIndicator size="large" color="#1a73e8"/></View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(row, i) => i + row.map(p=>p.id).join('')}
          stickySectionHeadersEnabled
          contentContainerStyle={{paddingBottom: 20}}
          renderSectionHeader={({section}) => (
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>{section.title}</Text>
            </View>
          )}
          renderItem={({item: row}) => (
            <View style={s.row}>
              {row.map((p, i) => (
                <Image
                  key={p.id}
                  source={{uri: p.localUri}}
                  style={s.tile}
                  resizeMode="cover"
                />
              ))}
              {row.length < COLS && Array.from({length: COLS - row.length}).map((_, i) => (
                <View key={'pad'+i} style={s.tilePad}/>
              ))}
            </View>
          )}
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={5}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  header: {
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? 44 : 54,
    paddingHorizontal: 12,
    paddingBottom: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: {width:0,height:1},
    shadowRadius: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f3f4',
    borderRadius: 24,
    paddingHorizontal: 14,
    height: 48,
  },
  searchIco: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, color: '#202124', fontSize: 16, paddingVertical: 0 },
  clearBtn: { color: '#999', fontSize: 16, paddingLeft: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 6, paddingLeft: 4 },
  statusText: { color: '#1a73e8', fontSize: 12 },
  statusDone: { color: '#aaa', fontSize: 11 },
  sectionHeader: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sectionTitle: { color: '#202124', fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', paddingHorizontal: GAP, marginBottom: GAP },
  tile: { width: TILE, height: TILE, marginHorizontal: GAP/2, backgroundColor: '#f1f3f4' },
  tilePad: { width: TILE, marginHorizontal: GAP/2 },
  noPermText: { color: '#666', fontSize: 16, textAlign: 'center', lineHeight: 24 },
  emptyText: { color: '#999', fontSize: 16 },
});
