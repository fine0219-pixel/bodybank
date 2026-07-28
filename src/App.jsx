import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const CAL_TARGET = 1000;
const LS_KEY = "bodybank_cfg";

// ▼▼▼ 여기 두 줄만 네 Supabase 값으로 채워 넣어 ▼▼▼
const SUPABASE_URL = "https://crqlkpxcnebbvxhdjtur.supabase.co";   // 예: "https://xxxx.supabase.co"
const SUPABASE_KEY = "sb_publishable_1DEAgwoZwJ3znTyDV6Bbwg_mQcr75DC";   // anon key (eyJ... 로 시작하는 긴 거)
// ▲▲▲ 채우면 첫 화면에서 URL·key 입력이 사라짐 ▲▲▲

const PROT_GOALS = [
  { mult:1.0, label:"체중 유지", desc:"운동 거의 안 함 · 근육 유지 최소선" },
  { mult:1.4, label:"체형 관리", desc:"주 2~3회 운동 · 일반 헬스인" },
  { mult:1.8, label:"근성장 · 근손실 방지", desc:"다이어트 중 근육 지키기 (적자 다이어트 추천)" },
  { mult:2.2, label:"최대 근비대", desc:"고강도 벌크업 · 대회 준비급" },
];

const todayStr = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const won = (n) => Math.round(n).toLocaleString("ko-KR");

const STOP = ["단품","세트","라지","미디엄","스몰","콤보","버거세트","1인분","한개","하나","작은","큰","곱빼기","보통","특","반","개","인분","그릇","공기","한","두","세"];
function coreQuery(text){
  let t=text.trim().replace(/\d+\s*(g|kg|ml|l|개|인분|조각|컵|잔|스푼)/gi," ");
  STOP.forEach(w=>{t=t.replace(new RegExp(w,"g")," ");});
  return t.replace(/\s+/g," ").trim()||text.trim();
}

// 운동 MET 지수 (강도) — 칼로리 = MET × 체중(kg) × 시간(h)
const EXERCISE_MET = [
  { keys:["달리기","러닝","런닝","조깅","뛰기"], met:9.8, label:"달리기" },
  { keys:["빠르게걷기","파워워킹","속보"], met:5.0, label:"빠르게 걷기" },
  { keys:["걷기","산책","워킹"], met:3.5, label:"걷기" },
  { keys:["자전거","사이클","싸이클","라이딩"], met:7.5, label:"자전거" },
  { keys:["수영"], met:8.0, label:"수영" },
  { keys:["등산","하이킹"], met:6.5, label:"등산" },
  { keys:["헬스","웨이트","웨이트트레이닝","근력","운동"], met:5.0, label:"헬스" },
  { keys:["요가","필라테스","스트레칭"], met:3.0, label:"요가" },
  { keys:["줄넘기"], met:11.0, label:"줄넘기" },
  { keys:["축구","풋살"], met:7.0, label:"축구" },
  { keys:["농구"], met:6.5, label:"농구" },
  { keys:["배드민턴"], met:5.5, label:"배드민턴" },
  { keys:["테니스"], met:7.0, label:"테니스" },
  { keys:["클라이밍","암벽"], met:8.0, label:"클라이밍" },
  { keys:["복싱","킥복싱"], met:9.0, label:"복싱" },
  { keys:["크로스핏"], met:8.0, label:"크로스핏" },
  { keys:["스피닝"], met:8.5, label:"스피닝" },
  { keys:["에어로빅","줌바"], met:6.5, label:"에어로빅" },
];
// "런닝 30분" → { met, label, minutes } 파싱
function parseExercise(text){
  const t=text.replace(/\s+/g,"");
  // 시간 추출: "30분", "1시간", "1시간30분", "90분"
  let minutes=0;
  const h=t.match(/(\d+(?:\.\d+)?)\s*시간/); if(h)minutes+=parseFloat(h[1])*60;
  const m=t.match(/(\d+)\s*분/); if(m)minutes+=parseInt(m[1]);
  if(!minutes){ const bare=t.match(/(\d+)/); if(bare)minutes=parseInt(bare[1]); } // 숫자만 있으면 분으로
  let found=null;
  for(const ex of EXERCISE_MET){ if(ex.keys.some(k=>t.includes(k))){ found=ex; break; } }
  return { found, minutes };
}

export default function App(){
  const [cfg,setCfg]=useState(()=>{ try{return JSON.parse(localStorage.getItem(LS_KEY))||{url:"",key:"",bmr:"",weight:"",protMult:1.8};}catch{return {url:"",key:"",bmr:"",weight:"",protMult:1.8};} });
  const [client,setClient]=useState(null);
  const [configured,setConfigured]=useState(false);

  const [date,setDate]=useState(todayStr());
  const [entries,setEntries]=useState([]);
  const [burn,setBurn]=useState(0);
  const [status,setStatus]=useState("");
  const [favs,setFavs]=useState([]);

  const [q,setQ]=useState("");
  const [grams,setGrams]=useState(100);
  const [results,setResults]=useState([]);
  const [searching,setSearching]=useState(false);
  const [note,setNote]=useState("");

  const [manual,setManual]=useState({name:"",kcal:"",prot:"",carb:"",fat:""});
  const [showManual,setShowManual]=useState(false);
  const [showSettings,setShowSettings]=useState(false);

  const [exName,setExName]=useState("");
  const [exKcal,setExKcal]=useState("");

  // 고정 키가 있으면 그걸로, 없으면 저장된 설정으로 자동 연결
  useEffect(()=>{
    const url = SUPABASE_URL || cfg.url;
    const key = SUPABASE_KEY || cfg.key;
    if(url&&key){
      try{ setClient(createClient(url,key)); setConfigured(true); }catch(e){ setStatus("연결 실패: "+e.message); }
    }
  },[]);

  const foods=entries.filter(e=>e.kind==="food");
  const exs=entries.filter(e=>e.kind==="exercise");
  const eaten=foods.reduce((s,e)=>s+e.kcal,0);
  const protIn=foods.reduce((s,e)=>s+(e.prot||0),0);
  const carbIn=foods.reduce((s,e)=>s+(e.carb||0),0);
  const fatIn=foods.reduce((s,e)=>s+(e.fat||0),0);
  const exercise=exs.reduce((s,e)=>s+e.kcal,0);
  const bmr=Number(cfg.bmr)||0,weight=Number(cfg.weight)||0;
  const out=bmr+exercise+Number(burn||0);
  const deficit=out-eaten;
  const protMult=Number(cfg.protMult)||1.8;
  const protTarget=Math.round(weight*protMult);
  const protPct=protTarget?Math.min(100,Math.round(protIn/protTarget*100)):0;
  const macroKcal=protIn*4+carbIn*4+fatIn*9;
  const pPct=macroKcal?Math.round(protIn*4/macroKcal*100):0;
  const cPct=macroKcal?Math.round(carbIn*4/macroKcal*100):0;
  const fPct=macroKcal?Math.max(0,100-pPct-cPct):0;

  const saveCfgAndConnect=()=>{
    const url = SUPABASE_URL || cfg.url;
    const key = SUPABASE_KEY || cfg.key;
    if(!url||!key){setStatus("URL과 anon key를 넣어주세요.");return;}
    try{
      localStorage.setItem(LS_KEY,JSON.stringify(cfg));
      setClient(createClient(url,key));
      setConfigured(true);setShowSettings(false);setStatus("");
    }catch(e){setStatus("연결 실패: "+e.message);}
  };
  const HAS_FIXED = !!(SUPABASE_URL && SUPABASE_KEY);

  useEffect(()=>{
    if(!client)return;
    (async()=>{
      const {data,error}=await client.from("calorie_log").select("*").eq("day",date);
      if(error){setStatus("불러오기 오류: "+error.message);return;}
      const rows=data||[];
      setEntries(rows.filter(r=>r.kind!=="burn").map(r=>({id:r.id,kind:r.kind,label:r.label,kcal:r.kcal,prot:r.prot||0,carb:r.carb||0,fat:r.fat||0})));
      const b=rows.find(r=>r.kind==="burn");setBurn(b?b.kcal:0);setStatus("");
    })();
  },[client,date]);

  useEffect(()=>{
    if(!client)return;
    (async()=>{const {data}=await client.from("food_fav").select("*").order("name");setFavs(data||[]);})();
  },[client]);

  const num=(v)=>{const n=parseFloat(String(v??"").replace(/[^0-9.\-]/g,""));return isNaN(n)?0:n;};

  const searchFood=async()=>{
    if(!q.trim())return;
    setSearching(true);setResults([]);setNote("");setStatus("");
    const core=coreQuery(q);
    const favHit=favs.filter(f=>f.name.includes(core)||core.includes(f.name));
    try{
      const res=await fetch(`/api/food?name=${encodeURIComponent(core)}`);
      const data=await res.json();
      if(data.error)throw new Error(data.error);
      const mapped=(data.items||[]).map(f=>({...f,fav:false}));
      const favMapped=favHit.map(f=>({name:f.name+" ⭐",kcal:f.kcal,prot:f.prot,carb:f.carb,fat:f.fat,base:f.base||100,fav:true}));
      const all=[...favMapped,...mapped];
      setResults(all);
      setNote(core!==q.trim()?`"${core}"(으)로 검색했어요`:"");
      if(!all.length){setStatus("결과가 없어요. 아래 직접 입력으로 넣고 저장하면 다음부턴 바로 떠요.");setShowManual(true);setManual(m=>({...m,name:q.trim()}));}
    }catch(e){
      if(favHit.length){setResults(favHit.map(f=>({name:f.name+" ⭐",kcal:f.kcal,prot:f.prot,carb:f.carb,fat:f.fat,base:f.base||100,fav:true})));setNote("즐겨찾기에서 찾았어요");}
      else{setStatus("음식 검색 실패: "+e.message);setShowManual(true);setManual(m=>({...m,name:q.trim()}));}
    }finally{setSearching(false);}
  };

  const addFood=async(f, gramsToAdd)=>{
    // 즐겨찾기는 1회분 그대로. 아니면 지정된 그램(1인분 or 100g 기준) 사용
    const g = f.fav ? null : (gramsToAdd || grams);
    const ratio = f.fav ? 1 : g/(f.base||100);
    const label = f.fav ? f.name.replace(" ⭐","") : `${f.name} ${g}g`;
    await insert({day:date,kind:"food",label,kcal:Math.round(f.kcal*ratio),prot:Math.round(f.prot*ratio*10)/10,carb:Math.round(f.carb*ratio*10)/10,fat:Math.round(f.fat*ratio*10)/10});
    setQ("");setResults([]);setGrams(100);setNote("");
  };

  const addManual=async(saveFav)=>{
    const m=manual;if(!m.name.trim())return;
    const row={day:date,kind:"food",label:m.name.trim(),kcal:Math.round(Number(m.kcal)||0),prot:num(m.prot),carb:num(m.carb),fat:num(m.fat)};
    await insert(row);
    if(saveFav&&client){
      const fav={name:m.name.trim(),kcal:row.kcal,prot:row.prot,carb:row.carb,fat:row.fat,base:100};
      const {data}=await client.from("food_fav").insert([fav]).select();
      if(data)setFavs(prev=>[...prev,...data]);
    }
    setManual({name:"",kcal:"",prot:"",carb:"",fat:""});setShowManual(false);setQ("");setResults([]);
  };

  const addExercise=async()=>{
    if(!exName.trim())return;
    let k=Math.round(Number(exKcal)||0);
    let label=exName.trim();
    // kcal 직접 안 넣었으면 자동 계산 시도
    if(k<=0){
      const {found,minutes}=parseExercise(exName);
      if(found&&minutes>0&&weight>0){
        k=Math.round(found.met*weight*(minutes/60));
        label=`${found.label} ${minutes}분`;
      }else if(found&&minutes>0&&weight<=0){
        setStatus("자동 계산하려면 설정에서 몸무게를 입력해주세요.");return;
      }else{
        setStatus("칼로리를 못 구했어요. 예: '러닝 30분' 또는 kcal 직접 입력");return;
      }
    }
    if(k<=0)return;
    await insert({day:date,kind:"exercise",label,kcal:k,prot:0,carb:0,fat:0});
    setExName("");setExKcal("");setStatus("");
  };

  const insert=async(row)=>{
    if(!client)return;
    const {data,error}=await client.from("calorie_log").insert([row]).select();
    if(error){setStatus("저장 오류: "+error.message);return;}
    setEntries(prev=>[...prev,...data.map(r=>({id:r.id,kind:r.kind,label:r.label,kcal:r.kcal,prot:r.prot||0,carb:r.carb||0,fat:r.fat||0}))]);
  };
  const removeEntry=async(id)=>{if(client)await client.from("calorie_log").delete().eq("id",id);setEntries(prev=>prev.filter(e=>e.id!==id));};
  const saveBurn=async(val)=>{
    const v=Math.max(0,Math.round(Number(val)||0));setBurn(v);
    if(!client)return;
    const {data}=await client.from("calorie_log").select("id").eq("day",date).eq("kind","burn");
    if(data&&data.length)await client.from("calorie_log").update({kcal:v,label:"가민 소모"}).eq("id",data[0].id);
    else await client.from("calorie_log").insert([{day:date,kind:"burn",label:"가민 소모",kcal:v}]);
  };

  const bg="#f2f4f8",card="#ffffff",ink="#1a1f27",sub="#8b95a5",line="#eef1f5",
        blue="#3d7bff",blueSoft="#eaf1ff",teal="#12b886",tealSoft="#e6f8f1",amber="#f6a609",coral="#fa5252";
  const font="'Pretendard','Apple SD Gothic Neo',system-ui,sans-serif";
  const shadow="0 2px 12px rgba(30,50,90,.06)";
  const inp={padding:"12px 14px",borderRadius:12,border:`1px solid ${line}`,background:"#fff",color:ink,fontSize:15,boxSizing:"border-box",fontFamily:font};
  const cardStyle={background:card,borderRadius:20,padding:20,marginBottom:14,boxShadow:shadow};

  if(!configured){
    return(
      <div style={{minHeight:"100vh",background:bg,color:ink,fontFamily:font,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div style={{background:card,borderRadius:22,padding:28,maxWidth:400,width:"100%",boxShadow:shadow}}>
          <div style={{fontSize:12,letterSpacing:2,color:blue,fontWeight:800}}>BODY BANK</div>
          <h1 style={{margin:"6px 0 4px",fontSize:24,fontWeight:800}}>계좌 개설</h1>
          <p style={{margin:"0 0 22px",fontSize:13,color:sub}}>한 번만 입력하면 다음부턴 바로 열려요</p>
          {(HAS_FIXED
            ? [["기초대사량 (kcal)","bmr","1800"],["몸무게 (kg)","weight","70"]]
            : [["Supabase URL","url","https://xxxx.supabase.co"],["anon key","key","eyJ..."],["기초대사량 (kcal)","bmr","1800"],["몸무게 (kg)","weight","70"]]
          ).map(([lab,k,ph])=>(
            <div key={k} style={{marginBottom:12}}>
              <label style={{fontSize:12,color:sub,fontWeight:600,display:"block",marginBottom:5}}>{lab}</label>
              <input value={cfg[k]} onChange={e=>setCfg({...cfg,[k]:e.target.value})} placeholder={ph} style={{...inp,width:"100%"}}/>
            </div>
          ))}
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,color:sub,fontWeight:600,display:"block",marginBottom:6}}>단백질 목표 (활동/목표에 맞게)</label>
            {PROT_GOALS.map(g=>{const on=Number(cfg.protMult)===g.mult;return(
              <div key={g.mult} onClick={()=>setCfg({...cfg,protMult:g.mult})} style={{border:`1.5px solid ${on?blue:line}`,background:on?blueSoft:"#fff",borderRadius:12,padding:"10px 12px",marginBottom:6,cursor:"pointer"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:14,fontWeight:700,color:on?blue:ink}}>{g.label}</span>
                  <span style={{fontSize:13,fontWeight:800,color:on?blue:sub}}>×{g.mult}g</span>
                </div>
                <div style={{fontSize:11,color:sub,marginTop:2}}>{g.desc}</div>
              </div>
            );})}
          </div>
          {status&&<div style={{color:coral,fontSize:13,marginBottom:10}}>{status}</div>}
          <button onClick={saveCfgAndConnect} style={{width:"100%",padding:15,borderRadius:14,border:"none",background:blue,color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:font}}>시작하기</button>
        </div>
      </div>
    );
  }

  const Row=({e,sign})=>(
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 0",borderBottom:`1px solid ${line}`}}>
      <div style={{width:36,height:36,borderRadius:11,background:sign<0?blueSoft:tealSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{sign<0?"🍽️":"🏃"}</div>
      <div style={{flex:1}}>
        <div style={{fontSize:15,fontWeight:600,color:ink}}>{e.label}</div>
        {e.kind==="food"&&e.prot>0&&<div style={{fontSize:12,color:sub}}>단백질 {e.prot}g</div>}
      </div>
      <div style={{fontSize:15,fontWeight:700,color:sign<0?coral:teal}}>{sign<0?"-":"+"}{won(e.kcal)}</div>
      <button onClick={()=>removeEntry(e.id)} style={{border:"none",background:"none",color:"#c9d2df",cursor:"pointer",fontSize:18,padding:"0 2px"}}>×</button>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:bg,color:ink,fontFamily:font,padding:"18px 14px 40px",boxSizing:"border-box",overflowX:"hidden",width:"100%"}}>
      <div style={{maxWidth:460,margin:"0 auto",width:"100%",boxSizing:"border-box"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,padding:"0 4px"}}>
          <span style={{fontSize:20,fontWeight:800,color:blue}}>Body Bank</span>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{border:`1px solid ${line}`,background:card,color:ink,fontFamily:font,fontSize:13,padding:"7px 10px",borderRadius:10,fontWeight:600}}/>
            <button onClick={()=>setShowSettings(!showSettings)} style={{border:`1px solid ${line}`,background:card,borderRadius:10,padding:"7px 10px",cursor:"pointer",fontSize:15}}>⚙️</button>
          </div>
        </div>

        {showSettings&&(
          <div style={cardStyle}>
            <div style={{fontSize:14,fontWeight:800,marginBottom:12}}>설정</div>
            {[["기초대사량 (kcal)","bmr"],["몸무게 (kg)","weight"]].map(([lab,k])=>(
              <div key={k} style={{marginBottom:10}}>
                <label style={{fontSize:12,color:sub,fontWeight:600,display:"block",marginBottom:4}}>{lab}</label>
                <input value={cfg[k]} onChange={e=>setCfg({...cfg,[k]:e.target.value})} style={{...inp,width:"100%"}}/>
              </div>
            ))}
            <label style={{fontSize:12,color:sub,fontWeight:600,display:"block",marginBottom:6}}>단백질 목표</label>
            {PROT_GOALS.map(g=>{const on=Number(cfg.protMult)===g.mult;return(
              <div key={g.mult} onClick={()=>setCfg({...cfg,protMult:g.mult})} style={{border:`1.5px solid ${on?blue:line}`,background:on?blueSoft:"#fff",borderRadius:12,padding:"9px 12px",marginBottom:6,cursor:"pointer"}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:14,fontWeight:700,color:on?blue:ink}}>{g.label}</span>
                  <span style={{fontSize:13,fontWeight:800,color:on?blue:sub}}>×{g.mult}g</span>
                </div>
                <div style={{fontSize:11,color:sub,marginTop:2}}>{g.desc}</div>
              </div>
            );})}
            <button onClick={()=>{localStorage.setItem(LS_KEY,JSON.stringify(cfg));setShowSettings(false);}} style={{width:"100%",padding:12,borderRadius:12,border:"none",background:blue,color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:font,marginTop:4}}>저장</button>
          </div>
        )}

        <div style={{background:`linear-gradient(135deg,${blue},#5b93ff)`,borderRadius:22,padding:22,marginBottom:14,color:"#fff",boxShadow:"0 6px 20px rgba(61,123,255,.3)"}}>
          <div style={{fontSize:13,opacity:.9,fontWeight:600}}>오늘의 칼로리 적자</div>
          <div style={{fontSize:40,fontWeight:800,margin:"4px 0 2px"}}>{deficit>=0?won(deficit):`-${won(-deficit)}`}<span style={{fontSize:18,opacity:.85,marginLeft:4}}>kcal</span></div>
          <div style={{fontSize:12,opacity:.85}}>목표 {won(CAL_TARGET)}kcal · {Math.round(Math.max(0,Math.min(1,deficit/CAL_TARGET))*100)}% 달성</div>
          <div style={{height:7,background:"rgba(255,255,255,.25)",borderRadius:5,marginTop:12,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.max(0,Math.min(1,deficit/CAL_TARGET))*100}%`,background:"#fff",borderRadius:5}}/></div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          <div style={{...cardStyle,marginBottom:0}}>
            <div style={{fontSize:12,color:sub,fontWeight:600}}>단백질 저축</div>
            <div style={{fontSize:26,fontWeight:800,color:protPct>=100?teal:ink,margin:"2px 0"}}>{protPct}<span style={{fontSize:15,color:sub}}>%</span></div>
            <div style={{fontSize:11,color:sub}}>{Math.round(protIn*10)/10} / {protTarget}g</div>
            <div style={{fontSize:10,color:sub,marginTop:2}}>몸무게 × {protMult}g</div>
            <div style={{height:6,background:line,borderRadius:4,marginTop:8,overflow:"hidden"}}><div style={{height:"100%",width:`${protPct}%`,background:teal,borderRadius:4}}/></div>
          </div>
          <div style={{...cardStyle,marginBottom:0}}>
            <div style={{fontSize:12,color:sub,fontWeight:600,marginBottom:8}}>탄단지 비율</div>
            <div style={{display:"flex",height:12,borderRadius:6,overflow:"hidden",background:line}}>
              <div style={{width:`${cPct}%`,background:blue}}/><div style={{width:`${pPct}%`,background:teal}}/><div style={{width:`${fPct}%`,background:amber}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginTop:6,fontWeight:600}}>
              <span style={{color:blue}}>탄{cPct}</span><span style={{color:teal}}>단{pPct}</span><span style={{color:amber}}>지{fPct}</span>
            </div>
          </div>
        </div>

        <div style={{...cardStyle,display:"flex",gap:6,flexWrap:"wrap",justifyContent:"space-between",alignItems:"center"}}>
          <Stat label="먹음" val={won(eaten)} sub={sub} ink={coral}/>
          <Stat label="기초대사" val={won(bmr)} sub={sub} ink={ink}/>
          <Stat label="운동" val={won(exercise)} sub={sub} ink={teal}/>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:11,color:sub,marginBottom:3}}>가민 소모</div>
            <input type="number" value={burn||""} onChange={e=>saveBurn(e.target.value)} placeholder="0" style={{width:70,border:`1px solid ${line}`,borderRadius:9,padding:"5px 8px",fontSize:14,textAlign:"center",color:ink,fontFamily:font,fontWeight:700}}/>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{fontSize:15,fontWeight:800,marginBottom:4}}>🍽️ 식사 기록</div>
          <div style={{fontSize:12,color:sub,marginBottom:12}}>먹은 걸 그냥 툭 쳐보세요</div>
          <div style={{display:"flex",gap:8}}>
            <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&searchFood()} placeholder="예: 상하이 스파이시버거 단품" style={{...inp,flex:1,minWidth:0}}/>
            <button onClick={searchFood} disabled={searching} style={{padding:"0 18px",borderRadius:12,border:"none",background:blue,color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:font,fontSize:14,flexShrink:0}}>{searching?"…":"검색"}</button>
          </div>
          {note&&<div style={{fontSize:12,color:blue,marginTop:8,fontWeight:600}}>{note}</div>}
          {results.length>0&&(
            <div style={{marginTop:12}}>
              <div style={{fontSize:11,color:sub,marginBottom:8}}>담을 양을 선택하세요</div>
              {results.map((f,i)=>{
                if(f.fav){ // 즐겨찾기: 1회분 그대로
                  return(
                    <div key={i} style={{padding:"10px 12px",borderRadius:12,background:i%2?bg:"transparent",marginBottom:4}}>
                      <div style={{fontSize:14,fontWeight:600,color:ink,marginBottom:6}}>{f.name}</div>
                      <button onClick={()=>addFood(f)} style={{padding:"7px 14px",borderRadius:9,border:"none",background:amber,color:"#fff",fontFamily:font,fontSize:13,fontWeight:700,cursor:"pointer"}}>1회분 담기 · {f.kcal}kcal</button>
                    </div>
                  );
                }
                const b=f.base||100;
                const rServ=f.serving?f.serving/b:null;
                const r100=100/b;
                return(
                  <div key={i} style={{padding:"10px 12px",borderRadius:12,background:i%2?bg:"transparent",marginBottom:4}}>
                    <div style={{fontSize:14,fontWeight:600,color:ink,marginBottom:2}}>{f.name}</div>
                    <div style={{fontSize:11,color:sub,marginBottom:8}}>{b}g당 {Math.round(f.kcal)}kcal · 단{Math.round(f.prot*10)/10}g</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {f.serving&&(
                        <button onClick={()=>addFood(f,f.serving)} style={{padding:"7px 12px",borderRadius:9,border:"none",background:blue,color:"#fff",fontFamily:font,fontSize:13,fontWeight:700,cursor:"pointer"}}>1인분({f.serving}g) · {Math.round(f.kcal*rServ)}kcal</button>
                      )}
                      <button onClick={()=>addFood(f,100)} style={{padding:"7px 12px",borderRadius:9,border:`1px solid ${blue}`,background:"#fff",color:blue,fontFamily:font,fontSize:13,fontWeight:700,cursor:"pointer"}}>100g · {Math.round(f.kcal*r100)}kcal</button>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <input type="number" placeholder="g" value={grams} onChange={e=>setGrams(Number(e.target.value)||0)} style={{width:56,padding:"6px 8px",borderRadius:9,border:`1px solid ${line}`,color:ink,fontFamily:font,fontSize:13,fontWeight:600}}/>
                        <button onClick={()=>addFood(f,grams)} style={{padding:"7px 10px",borderRadius:9,border:"none",background:teal,color:"#fff",fontFamily:font,fontSize:13,fontWeight:700,cursor:"pointer"}}>담기</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button onClick={()=>{setShowManual(!showManual);if(!manual.name)setManual(m=>({...m,name:q.trim()}));}} style={{marginTop:10,background:bg,border:"none",color:sub,fontFamily:font,fontSize:13,fontWeight:600,padding:"10px 14px",borderRadius:10,cursor:"pointer",width:"100%"}}>+ 직접 입력 / 즐겨찾기 저장</button>
          {showManual&&(
            <div style={{marginTop:12,borderTop:`1px solid ${line}`,paddingTop:14}}>
              <input value={manual.name} onChange={e=>setManual({...manual,name:e.target.value})} placeholder="메뉴 이름 (예: 상하이버거 단품)" style={{...inp,width:"100%",marginBottom:8}}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
                <input value={manual.kcal} onChange={e=>setManual({...manual,kcal:e.target.value})} placeholder="kcal" style={inp}/>
                <input value={manual.prot} onChange={e=>setManual({...manual,prot:e.target.value})} placeholder="단백" style={inp}/>
                <input value={manual.carb} onChange={e=>setManual({...manual,carb:e.target.value})} placeholder="탄수" style={inp}/>
                <input value={manual.fat} onChange={e=>setManual({...manual,fat:e.target.value})} placeholder="지방" style={inp}/>
              </div>
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <button onClick={()=>addManual(false)} style={{flex:1,padding:13,borderRadius:12,border:`1px solid ${teal}`,background:tealSoft,color:teal,fontFamily:font,fontWeight:700,cursor:"pointer",fontSize:14}}>기록만</button>
                <button onClick={()=>addManual(true)} style={{flex:1,padding:13,borderRadius:12,border:"none",background:amber,color:"#fff",fontFamily:font,fontWeight:700,cursor:"pointer",fontSize:14}}>기록 + ⭐저장</button>
              </div>
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{fontSize:15,fontWeight:800,marginBottom:4}}>🏃 운동 기록</div>
          <div style={{fontSize:12,color:sub,marginBottom:12}}>"러닝 30분"처럼 치면 칼로리 자동 계산 (kcal 비워두면 됨)</div>
          <div style={{display:"flex",gap:8}}>
            <input value={exName} onChange={e=>setExName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addExercise()} placeholder="러닝 30분 / 헬스 1시간" style={{...inp,flex:1,minWidth:0}}/>
            <input type="number" value={exKcal} onChange={e=>setExKcal(e.target.value)} placeholder="kcal" style={{...inp,width:64,flexShrink:0}}/>
            <button onClick={addExercise} style={{padding:"0 16px",borderRadius:12,border:"none",background:teal,color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:font,fontSize:18,flexShrink:0}}>+</button>
          </div>
        </div>

        {status&&<div style={{color:coral,fontSize:13,marginBottom:12,padding:"0 6px"}}>{status}</div>}

        <div style={cardStyle}>
          <div style={{fontSize:15,fontWeight:800,marginBottom:6}}>거래 내역</div>
          {foods.length===0&&exs.length===0&&<div style={{color:sub,fontSize:14,padding:"16px 0",textAlign:"center"}}>아직 오늘 기록이 없어요</div>}
          {foods.map(e=><Row key={e.id} e={e} sign={-1}/>)}
          {exs.map(e=><Row key={e.id} e={e} sign={+1}/>)}
        </div>

        <p style={{fontSize:12,color:sub,textAlign:"center",marginTop:8,lineHeight:1.7}}>영양 수치는 식약처 DB 추정치예요.<br/>자주 먹는 건 ⭐로 저장해두면 다음부턴 바로 떠요.</p>
      </div>
    </div>
  );
}

function Stat({label,val,sub,ink}){
  return(<div style={{textAlign:"center"}}>
    <div style={{fontSize:11,color:sub,marginBottom:3}}>{label}</div>
    <div style={{fontSize:16,fontWeight:800,color:ink}}>{val}</div>
  </div>);
}
