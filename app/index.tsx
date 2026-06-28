import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, Image, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Dimensions,
  SectionList, Platform,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

// --- key (xor obfuscated) ---
const _e='5941074b445e074b5a431a190748476d6c5b791c19401c696560186b07676f7f1d1f19121d681c6065671d7c406f5a4d6e6b68627e5f0742694e7c65594c795b1a735c7a485b4941194d48695b535263417f4f5a1b7b1c437c5c5a66607b7e1c45647b0718611e1f136b6b6b';
const _ck=()=>_e.match(/.{2}/g)!.map(h=>String.fromCharCode(parseInt(h,16)^42)).join('');

const API='https://api.anthropic.com/v1/messages';
const W=Dimensions.get('window').width;
const COLS=3;
const CELL=(W)/COLS;

// --- DB ---
let _db:SQLite.SQLiteDatabase|null=null;
async function getDB(){
  if(_db)return _db;
  _db=await SQLite.openDatabaseAsync('pf4.db');
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS p(id TEXT PRIMARY KEY,uri TEXT,txt TEXT);
  `);
  return _db;
}
async function isIndexed(id:string){
  const d=await getDB();
  return !!(await d.getFirstAsync<{id:string}>('SELECT id FROM p WHERE id=?',[id]));
}
async function save(id:string,uri:string,txt:string){
  const d=await getDB();
  await d.runAsync('INSERT OR REPLACE INTO p(id,uri,txt)VALUES(?,?,?)',[id,uri,txt]);
}
async function cntIndexed(){
  const d=await getDB();
  const r=await d.getFirstAsync<{c:number}>('SELECT count(*)as c FROM p');
  return r?.c??0;
}
async function search(q:string):Promise<string[]>{
  const d=await getDB();
  const rows=await d.getAllAsync<{uri:string}>(
    'SELECT uri FROM p WHERE lower(txt) LIKE ? LIMIT 500',[`%${q.toLowerCase()}%`]
  );
  return rows.map(r=>r.uri);
}

// --- Claude ---
async function describe(localUri:string):Promise<string>{
  const r=await ImageManipulator.manipulateAsync(
    localUri,[{resize:{width:512}}],
    {compress:0.7,format:ImageManipulator.SaveFormat.JPEG}
  );
  const b64=await FileSystem.readAsStringAsync(r.uri,{encoding:FileSystem.EncodingType.Base64});
  const res=await fetch(API,{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':_ck(),'anthropic-version':'2023-06-01'},
    body:JSON.stringify({
      model:'claude-haiku-4-5-20251001',
      max_tokens:120,
      messages:[{role:'user',content:[
        {type:'image',source:{type:'base64',media_type:'image/jpeg',data:b64}},
        {type:'text',text:'Опиши фото кратко на русском: люди, место, предметы, цвета. 1 предложение.'},
      ]}],
    }),
  });
  const j=await res.json();
  return j.content?.[0]?.text?.trim()??'';
}

// --- month label ---
function monthLabel(ts:number){
  const d=new Date(ts);
  const months=['Январь','Февраль','Март','Апрель','Май','Июнь',
    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  return months[d.getMonth()]+' '+d.getFullYear();
}

type Asset={id:string;uri:string;localUri?:string;creationTime:number;filename:string};

export default function App(){
  const [perm,setPerm]=useState<'pending'|'ok'|'no'>('pending');
  const [sections,setSections]=useState<{title:string;data:string[][]}[]>([]);
  const [searchUris,setSearchUris]=useState<string[]|null>(null);
  const [q,setQ]=useState('');
  const [loading,setLoading]=useState(false);
  const [idx,setIdx]=useState(0);
  const [tot,setTot]=useState(0);
  const [idxing,setIdxing]=useState(false);
  const running=useRef(false);
  const allAssets=useRef<Asset[]>([]);

  useEffect(()=>{
    (async()=>{
      const {status}=await MediaLibrary.requestPermissionsAsync();
      if(status!=='granted'){setPerm('no');return;}
      setPerm('ok');
      const cnt=await cntIndexed();
      setIdx(cnt);
      load();
    })();
  },[]);

  async function load(){
    // Load all assets with localUri
    let list:Asset[]=[];
    let after:string|undefined;
    while(true){
      const pg=await MediaLibrary.getAssetsAsync({
        mediaType:'photo',first:100,after,
        sortBy:[[MediaLibrary.SortBy.creationTime,false]],
      });
      for(const a of pg.assets){
        // getAssetInfoAsync gives localUri which works in <Image>
        const info=await MediaLibrary.getAssetInfoAsync(a);
        list.push({
          id:a.id,
          uri:a.uri,
          localUri:info.localUri||a.uri,
          creationTime:a.creationTime,
          filename:a.filename,
        });
      }
      if(!pg.hasNextPage)break;
      after=pg.endCursor;
    }
    allAssets.current=list;
    setTot(list.length);
    buildSections(list.map(a=>a.localUri||a.uri),list.map(a=>a.creationTime));
    startIndexing(list);
  }

  function buildSections(uris:string[],times:number[]){
    const map=new Map<string,string[]>();
    uris.forEach((u,i)=>{
      const m=monthLabel(times[i]);
      if(!map.has(m))map.set(m,[]);
      map.get(m)!.push(u);
    });
    const secs:any[]=[];
    map.forEach((uris,title)=>{
      // chunk into rows of COLS
      const rows:string[][]=[];
      for(let i=0;i<uris.length;i+=COLS)rows.push(uris.slice(i,i+COLS));
      secs.push({title,data:rows});
    });
    setSections(secs);
  }

  async function startIndexing(list:Asset[]){
    if(running.current)return;
    running.current=true;
    setIdxing(true);
    for(const a of list){
      if(await isIndexed(a.id))continue;
      try{
        const uri=a.localUri||a.uri;
        const desc=await describe(uri);
        await save(a.id,a.localUri||a.uri,a.filename+' '+desc);
        setIdx(n=>n+1);
      }catch{}
    }
    running.current=false;
    setIdxing(false);
  }

  // search
  useEffect(()=>{
    const t=setTimeout(async()=>{
      if(!q.trim()){setSearchUris(null);return;}
      setLoading(true);
      const res=await search(q);
      setSearchUris(res);
      setLoading(false);
    },500);
    return()=>clearTimeout(t);
  },[q]);

  if(perm==='pending')return <View style={s.center}><ActivityIndicator color="#fff" size="large"/></View>;
  if(perm==='no')return(
    <View style={s.center}>
      <Text style={s.msg}>Нет доступа к галерее.{'\n'}Разрешите в настройках.</Text>
    </View>
  );

  return(
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000"/>

      {/* search bar */}
      <View style={s.topBar}>
        <View style={s.searchBox}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            placeholder="Поиск в фото"
            placeholderTextColor="#888"
            value={q}
            onChangeText={setQ}
          />
          {q.length>0&&<TouchableOpacity onPress={()=>setQ('')}><Text style={s.clear}>✕</Text></TouchableOpacity>}
        </View>
      </View>

      {/* indexing status */}
      {(idxing||tot>0)&&(
        <View style={s.statusBar}>
          {idxing
            ?<><ActivityIndicator size="small" color="#8ab4f8" style={{marginRight:6}}/>
              <Text style={s.statusTxt}>Индексация {idx}/{tot}</Text></>
            :<Text style={s.statusDone}>✓ {idx} фото проиндексировано</Text>
          }
        </View>
      )}

      {/* content */}
      {loading?(
        <View style={s.center}><ActivityIndicator color="#fff" size="large"/></View>
      ):searchUris!==null?(
        searchUris.length===0?(
          <View style={s.center}><Text style={s.msg}>Ничего не найдено</Text></View>
        ):(
          <FlatList
            data={searchUris}
            keyExtractor={(u,i)=>u+i}
            numColumns={COLS}
            renderItem={({item})=>(
              <Image source={{uri:item}} style={s.cell} resizeMode="cover"/>
            )}
            removeClippedSubviews initialNumToRender={30}
          />
        )
      ):(
        <SectionList
          sections={sections}
          keyExtractor={(row,i)=>row.join('')+i}
          renderSectionHeader={({section:{title}})=>(
            <Text style={s.monthLabel}>{title}</Text>
          )}
          renderItem={({item:row})=>(
            <View style={s.row}>
              {row.map((uri,i)=>(
                <Image key={uri+i} source={{uri}} style={s.cell} resizeMode="cover"/>
              ))}
              {row.length<COLS&&Array(COLS-row.length).fill(0).map((_,i)=>(
                <View key={'empty'+i} style={s.cell}/>
              ))}
            </View>
          )}
          stickySectionHeadersEnabled
          removeClippedSubviews
          initialNumToRender={20}
        />
      )}
    </View>
  );
}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#111'},
  center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#111'},
  topBar:{paddingHorizontal:12,paddingTop:Platform.OS==='android'?40:50,paddingBottom:8},
  searchBox:{
    flexDirection:'row',alignItems:'center',
    backgroundColor:'#2a2a2a',borderRadius:28,
    paddingHorizontal:16,height:46,
  },
  searchIcon:{fontSize:16,marginRight:8},
  searchInput:{flex:1,color:'#fff',fontSize:15,paddingVertical:0},
  clear:{color:'#888',fontSize:18,paddingHorizontal:4},
  statusBar:{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingBottom:6},
  statusTxt:{color:'#8ab4f8',fontSize:12},
  statusDone:{color:'#555',fontSize:11},
  monthLabel:{
    color:'#fff',fontSize:14,fontWeight:'600',
    paddingHorizontal:12,paddingVertical:8,
    backgroundColor:'#111',
  },
  row:{flexDirection:'row'},
  cell:{width:CELL,height:CELL,margin:0.5,backgroundColor:'#222'},
  msg:{color:'#aaa',fontSize:16,textAlign:'center',padding:32},
});
