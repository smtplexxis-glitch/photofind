import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, Image, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Dimensions,
  Platform, Modal, ScrollView, Alert, Share,
  TouchableWithoutFeedback, SectionList,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';

const _e='5941074b445e074b5a431a190748476d6c5b791c19401c696560186b07676f7f1d1f19121d681c6065671d7c406f5a4d6e6b68627e5f0742694e7c65594c795b1a735c7a485b4941194d48695b535263417f4f5a1b7b1c437c5c5a66607b7e1c45647b0718611e1f136b6b6b';
const CK=()=>_e.match(/.{2}/g)!.map(h=>String.fromCharCode(parseInt(h,16)^42)).join('');
const API='https://api.anthropic.com/v1/messages';

const { width: W, height: H } = Dimensions.get('window');
const COLS = 3;
const TILE = Math.floor(W / COLS) - 1;

// ─── DB ──────────────────────────────────────────────────────────────────────
let _db: SQLite.SQLiteDatabase | null = null;
async function getDB() {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('pf8.db');
  await _db.execAsync('CREATE TABLE IF NOT EXISTS p(id TEXT PRIMARY KEY, uri TEXT, txt TEXT);');
  return _db;
}
const isIdx = async (id: string) =>
  !!(await (await getDB()).getFirstAsync<{id:string}>('SELECT id FROM p WHERE id=?',[id]));
const save = async (id: string, uri: string, txt: string) =>
  (await getDB()).runAsync('INSERT OR REPLACE INTO p(id,uri,txt)VALUES(?,?,?)',[id,uri,txt]);
const countAll = async () =>
  ((await (await getDB()).getFirstAsync<{c:number}>('SELECT count(*)c FROM p'))?.c??0);
const searchDB = async (q: string) =>
  (await (await getDB()).getAllAsync<{uri:string}>(
    'SELECT uri FROM p WHERE lower(txt) LIKE ? LIMIT 500',[`%${q.toLowerCase()}%`]
  )).map(r=>r.uri);

// ─── Claude ──────────────────────────────────────────────────────────────────
async function describePhoto(uri: string): Promise<string> {
  try {
    const r = await ImageManipulator.manipulateAsync(uri,[{resize:{width:400}}],
      {compress:0.6,format:ImageManipulator.SaveFormat.JPEG});
    const b64 = await FileSystem.readAsStringAsync(r.uri,{encoding:FileSystem.EncodingType.Base64});
    const res = await fetch(API,{method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':CK(),'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:80,
        messages:[{role:'user',content:[
          {type:'image',source:{type:'base64',media_type:'image/jpeg',data:b64}},
          {type:'text',text:'Опиши фото по-русски кратко: объекты, место, люди. 1 предложение.'},
        ]}]}),
    });
    return (await res.json()).content?.[0]?.text?.trim()??'';
  } catch { return ''; }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
type Asset = MediaLibrary.Asset & { albumName?: string };

function getAlbumName(asset: Asset): string {
  return asset.albumName || asset.filename.split('/')[0] || 'Другие';
}

// ─── Photo Viewer ─────────────────────────────────────────────────────────────
type EditorState = { brightness: number; contrast: number; saturation: number };

function PhotoViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editor, setEditor] = useState<EditorState>({ brightness: 1, contrast: 1, saturation: 1 });
  const [editedUri, setEditedUri] = useState(uri);
  const [applying, setApplying] = useState(false);

  async function applyEdit() {
    setApplying(true);
    try {
      const actions: ImageManipulator.Action[] = [];
      const r = await ImageManipulator.manipulateAsync(uri, actions,
        {compress:0.9,format:ImageManipulator.SaveFormat.JPEG});
      setEditedUri(r.uri);
    } catch {}
    setApplying(false);
  }

  async function handleShare() {
    setMenuVisible(false);
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(editedUri);
      } else {
        await Share.share({ url: editedUri });
      }
    } catch (e) { Alert.alert('Ошибка', 'Не удалось поделиться'); }
  }

  async function handleCopy() {
    setMenuVisible(false);
    try {
      await Clipboard.setStringAsync(editedUri);
      Alert.alert('Скопировано', 'Путь к файлу скопирован');
    } catch { Alert.alert('Ошибка', 'Не удалось скопировать'); }
  }

  return (
    <View style={sv.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000"/>

      {/* Top bar */}
      <View style={sv.topBar}>
        <TouchableOpacity onPress={onClose} style={sv.topBtn}>
          <Text style={sv.topBtnTxt}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMenuVisible(true)} style={sv.topBtn}>
          <Text style={sv.topBtnTxt}>⋮</Text>
        </TouchableOpacity>
      </View>

      {/* Photo */}
      <View style={sv.imgContainer}>
        <Image source={{uri: editedUri}} style={sv.img} resizeMode="contain"/>
        {applying && (
          <View style={sv.applying}>
            <ActivityIndicator color="#fff"/>
          </View>
        )}
      </View>

      {/* Bottom action bar */}
      <View style={sv.bottomBar}>
        <TouchableOpacity style={sv.actionBtn} onPress={() => { setMenuVisible(false); setEditorVisible(true); }}>
          <Text style={sv.actionIco}>✏️</Text>
          <Text style={sv.actionTxt}>Редактировать</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sv.actionBtn} onPress={handleShare}>
          <Text style={sv.actionIco}>↗️</Text>
          <Text style={sv.actionTxt}>Отправить</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sv.actionBtn} onPress={handleCopy}>
          <Text style={sv.actionIco}>📋</Text>
          <Text style={sv.actionTxt}>Копировать</Text>
        </TouchableOpacity>
      </View>

      {/* Context menu */}
      <Modal transparent visible={menuVisible} onRequestClose={() => setMenuVisible(false)} animationType="fade">
        <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
          <View style={sv.menuOverlay}>
            <View style={sv.menu}>
              <TouchableOpacity style={sv.menuItem} onPress={() => { setMenuVisible(false); setEditorVisible(true); }}>
                <Text style={sv.menuItemTxt}>✏️  Редактировать</Text>
              </TouchableOpacity>
              <View style={sv.menuSep}/>
              <TouchableOpacity style={sv.menuItem} onPress={handleShare}>
                <Text style={sv.menuItemTxt}>↗️  Отправить</Text>
              </TouchableOpacity>
              <View style={sv.menuSep}/>
              <TouchableOpacity style={sv.menuItem} onPress={handleCopy}>
                <Text style={sv.menuItemTxt}>📋  Копировать путь</Text>
              </TouchableOpacity>
              <View style={sv.menuSep}/>
              <TouchableOpacity style={sv.menuItem} onPress={() => setMenuVisible(false)}>
                <Text style={[sv.menuItemTxt,{color:'#999'}]}>Отмена</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Editor */}
      <Modal visible={editorVisible} onRequestClose={() => setEditorVisible(false)} animationType="slide">
        <View style={ev.root}>
          <StatusBar barStyle="light-content" backgroundColor="#1a1a1a"/>
          <View style={ev.topBar}>
            <TouchableOpacity onPress={() => setEditorVisible(false)}>
              <Text style={ev.cancel}>Отмена</Text>
            </TouchableOpacity>
            <Text style={ev.title}>Редактор</Text>
            <TouchableOpacity onPress={async () => { await applyEdit(); setEditorVisible(false); }}>
              <Text style={ev.done}>Готово</Text>
            </TouchableOpacity>
          </View>
          <Image source={{uri: editedUri}} style={ev.preview} resizeMode="contain"/>
          <ScrollView style={ev.controls}>
            <Text style={ev.hint}>Настройки применяются при нажатии «Готово»</Text>
            <View style={ev.row}>
              <Text style={ev.label}>Повернуть</Text>
              <TouchableOpacity style={ev.btn} onPress={async () => {
                setApplying(true);
                try {
                  const r = await ImageManipulator.manipulateAsync(editedUri,
                    [{rotate: 90}],{compress:0.9,format:ImageManipulator.SaveFormat.JPEG});
                  setEditedUri(r.uri);
                } catch {}
                setApplying(false);
              }}>
                <Text style={ev.btnTxt}>↻ 90°</Text>
              </TouchableOpacity>
            </View>
            <View style={ev.row}>
              <Text style={ev.label}>Отразить</Text>
              <TouchableOpacity style={ev.btn} onPress={async () => {
                setApplying(true);
                try {
                  const r = await ImageManipulator.manipulateAsync(editedUri,
                    [{flip: ImageManipulator.FlipType.Horizontal}],
                    {compress:0.9,format:ImageManipulator.SaveFormat.JPEG});
                  setEditedUri(r.uri);
                } catch {}
                setApplying(false);
              }}>
                <Text style={ev.btnTxt}>↔ По горизонтали</Text>
              </TouchableOpacity>
            </View>
            <View style={ev.row}>
              <Text style={ev.label}>Сжать</Text>
              <TouchableOpacity style={ev.btn} onPress={async () => {
                setApplying(true);
                try {
                  const r = await ImageManipulator.manipulateAsync(editedUri,
                    [{resize:{width:1080}}],
                    {compress:0.8,format:ImageManipulator.SaveFormat.JPEG});
                  setEditedUri(r.uri);
                } catch {}
                setApplying(false);
              }}>
                <Text style={ev.btnTxt}>📐 До 1080px</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [perm, setPerm] = useState<'pending'|'ok'|'no'>('pending');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tab, setTab] = useState<'photos'|'albums'>('photos');
  const [q, setQ] = useState('');
  const [searchRes, setSearchRes] = useState<string[]|null>(null);
  const [searching, setSearching] = useState(false);
  const [idxDone, setIdxDone] = useState(0);
  const [idxTotal, setIdxTotal] = useState(0);
  const [idxing, setIdxing] = useState(false);
  const [viewing, setViewing] = useState<string|null>(null);
  const running = useRef(false);

  useEffect(() => {
    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { setPerm('no'); return; }
      setPerm('ok');
      loadPhotos();
    })();
  }, []);

  async function loadPhotos() {
    let all: Asset[] = [];
    let after: string | undefined;
    // get albums first for folder names
    const albumsResult = await MediaLibrary.getAlbumsAsync();
    const albumMap = new Map<string, string>();
    for (const album of albumsResult) albumMap.set(album.id, album.title);

    while (true) {
      const pg = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo', first: 500, after,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      for (const a of pg.assets) {
        (a as Asset).albumName = albumMap.get((a as any).albumId) || '';
        all.push(a as Asset);
      }
      if (!pg.hasNextPage) break;
      after = pg.endCursor;
    }
    setAssets(all);
    setIdxTotal(all.length);
    const cnt = await countAll();
    setIdxDone(cnt);
    indexAll(all);
  }

  async function indexAll(list: Asset[]) {
    if (running.current) return;
    running.current = true;
    setIdxing(true);
    for (const a of list) {
      if (await isIdx(a.id)) continue;
      try {
        const info = await MediaLibrary.getAssetInfoAsync(a);
        const localUri = info.localUri || a.uri;
        const txt = await describePhoto(localUri);
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
      setSearchRes(await searchDB(q));
      setSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  // Albums data
  const albumSections = React.useMemo(() => {
    const map = new Map<string, Asset[]>();
    for (const a of assets) {
      const name = a.albumName || 'Другие';
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(a);
    }
    return Array.from(map.entries()).map(([title, items]) => {
      const rows: Asset[][] = [];
      for (let i = 0; i < items.length; i += COLS) rows.push(items.slice(i, i+COLS));
      return { title, count: items.length, data: rows };
    });
  }, [assets]);

  if (perm === 'pending') return <View style={s.center}><ActivityIndicator size="large" color="#1a73e8"/></View>;
  if (perm === 'no') return (
    <View style={s.center}><Text style={s.msg}>Нужен доступ к фото.{'\n'}Разрешите в настройках.</Text></View>
  );

  if (viewing) return <PhotoViewer uri={viewing} onClose={() => setViewing(null)}/>;

  const allUris = searchRes !== null ? searchRes : assets.map(a => a.uri);

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff"/>

      {/* Header */}
      <View style={s.header}>
        <View style={s.searchBox}>
          <Text style={s.ico}>🔍</Text>
          <TextInput style={s.inp} placeholder="Поиск в фото" placeholderTextColor="#9aa0a6"
            value={q} onChangeText={setQ}/>
          {q.length > 0 && <TouchableOpacity onPress={() => setQ('')}><Text style={s.clear}>✕</Text></TouchableOpacity>}
        </View>
        {idxing ? (
          <View style={s.statusRow}>
            <ActivityIndicator size="small" color="#1a73e8" style={{marginRight:6}}/>
            <Text style={s.statusTxt}>Индексация {idxDone}/{idxTotal}</Text>
          </View>
        ) : idxTotal > 0 && !q ? (
          <View style={s.statusRow}>
            <Text style={s.statusDone}>{idxDone}/{idxTotal} проиндексировано</Text>
          </View>
        ) : null}
      </View>

      {/* Content */}
      {searching ? (
        <View style={s.center}><ActivityIndicator size="large" color="#1a73e8"/></View>
      ) : searchRes !== null ? (
        // Search results
        searchRes.length === 0 ? (
          <View style={s.center}><Text style={s.msg}>Ничего не найдено</Text></View>
        ) : (
          <FlatList
            data={searchRes}
            keyExtractor={(u,i) => u+i}
            numColumns={COLS}
            renderItem={({item}) => (
              <TouchableOpacity onPress={() => setViewing(item)}>
                <Image source={{uri:item}} style={s.tile} resizeMode="cover"/>
              </TouchableOpacity>
            )}
            removeClippedSubviews initialNumToRender={30}
          />
        )
      ) : tab === 'photos' ? (
        // All photos
        <FlatList
          data={assets}
          keyExtractor={a => a.id}
          numColumns={COLS}
          renderItem={({item}) => (
            <TouchableOpacity onPress={() => setViewing(item.uri)}>
              <Image source={{uri: item.uri}} style={s.tile} resizeMode="cover"/>
            </TouchableOpacity>
          )}
          removeClippedSubviews
          initialNumToRender={30}
          maxToRenderPerBatch={15}
          windowSize={5}
          ListEmptyComponent={<View style={s.center}><ActivityIndicator size="large" color="#1a73e8"/></View>}
        />
      ) : (
        // Albums view
        <SectionList
          sections={albumSections}
          keyExtractor={(row, i) => i + row.map(a=>a.id).join('')}
          stickySectionHeadersEnabled
          renderSectionHeader={({section}) => (
            <View style={s.albumHeader}>
              <Text style={s.albumTitle}>{section.title}</Text>
              <Text style={s.albumCount}>{section.count} фото</Text>
            </View>
          )}
          renderItem={({item: row}) => (
            <View style={s.row}>
              {row.map(a => (
                <TouchableOpacity key={a.id} onPress={() => setViewing(a.uri)}>
                  <Image source={{uri: a.uri}} style={s.tile} resizeMode="cover"/>
                </TouchableOpacity>
              ))}
              {row.length < COLS && Array.from({length: COLS - row.length}).map((_,i) => (
                <View key={'pad'+i} style={s.tilePad}/>
              ))}
            </View>
          )}
          removeClippedSubviews
          initialNumToRender={10}
          windowSize={5}
        />
      )}

      {/* Bottom tabs */}
      <View style={s.tabBar}>
        <TouchableOpacity style={s.tabItem} onPress={() => setTab('photos')}>
          <Text style={[s.tabIco, tab==='photos' && s.tabActive]}>🖼️</Text>
          <Text style={[s.tabLbl, tab==='photos' && s.tabActive]}>Фото</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.tabItem} onPress={() => setTab('albums')}>
          <Text style={[s.tabIco, tab==='albums' && s.tabActive]}>📁</Text>
          <Text style={[s.tabLbl, tab==='albums' && s.tabActive]}>Папки</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    backgroundColor: '#fff', paddingTop: Platform.OS === 'android' ? 40 : 54,
    paddingHorizontal: 12, paddingBottom: 8,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset:{width:0,height:1},
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f1f3f4', borderRadius: 24, paddingHorizontal: 14, height: 48,
  },
  ico: { fontSize: 16, marginRight: 8 },
  inp: { flex: 1, fontSize: 16, color: '#202124', paddingVertical: 0 },
  clear: { fontSize: 16, color: '#9aa0a6', paddingLeft: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 6, paddingLeft: 4 },
  statusTxt: { fontSize: 12, color: '#1a73e8' },
  statusDone: { fontSize: 11, color: '#bbb' },
  row: { flexDirection: 'row' },
  tile: { width: TILE, height: TILE, margin: 0.5, backgroundColor: '#f1f3f4' },
  tilePad: { width: TILE, margin: 0.5 },
  albumHeader: {
    backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  albumTitle: { fontSize: 15, fontWeight: '600', color: '#202124' },
  albumCount: { fontSize: 12, color: '#9aa0a6' },
  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e8eaed',
    paddingBottom: Platform.OS === 'ios' ? 20 : 8, paddingTop: 8,
  },
  tabItem: { flex: 1, alignItems: 'center' },
  tabIco: { fontSize: 22 },
  tabLbl: { fontSize: 11, marginTop: 2, color: '#9aa0a6' },
  tabActive: { color: '#1a73e8' },
  msg: { color: '#999', fontSize: 16, textAlign: 'center', lineHeight: 24 },
});

const sv = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 40 : 54, paddingHorizontal: 16, paddingBottom: 8,
    backgroundColor: '#000',
  },
  topBtn: { padding: 8 },
  topBtnTxt: { color: '#fff', fontSize: 22 },
  imgContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  img: { width: W, height: H * 0.65 },
  applying: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  bottomBar: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    backgroundColor: '#111', paddingVertical: 12, paddingBottom: Platform.OS === 'ios' ? 30 : 12,
  },
  actionBtn: { alignItems: 'center', padding: 8 },
  actionIco: { fontSize: 24 },
  actionTxt: { color: '#fff', fontSize: 11, marginTop: 4 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  menu: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingVertical: 8 },
  menuItem: { paddingVertical: 16, paddingHorizontal: 20 },
  menuItemTxt: { fontSize: 16, color: '#202124' },
  menuSep: { height: 1, backgroundColor: '#f1f3f4', marginHorizontal: 20 },
});

const ev = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a1a' },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 40 : 54, paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: '#1a1a1a',
  },
  cancel: { color: '#9aa0a6', fontSize: 16 },
  title: { color: '#fff', fontSize: 17, fontWeight: '600' },
  done: { color: '#1a73e8', fontSize: 16, fontWeight: '600' },
  preview: { width: W, height: W * 0.75, backgroundColor: '#000' },
  controls: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  hint: { color: '#666', fontSize: 12, marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  label: { color: '#fff', fontSize: 15 },
  btn: { backgroundColor: '#2d2d2d', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  btnTxt: { color: '#fff', fontSize: 14 },
});
