import './styles.css';

const names = ['CLEAN', 'TIGHT', 'SMOOTH', 'WARMTH', 'AIR', 'SPACE', 'WIDTH'];
const presets: Record<string, number[]> = {
  'Clean & Natural': [62, 52, 45, 35, 45, 20, 30],
  'Warm & Intimate': [45, 58, 68, 76, 25, 28, 22],
  'Modern R&B': [55, 72, 64, 48, 67, 42, 58],
  'Airy Lead': [50, 58, 55, 38, 84, 38, 52],
  'Smooth & Dark': [42, 62, 82, 68, 18, 35, 35],
  Dreamy: [38, 45, 72, 55, 62, 76, 70],
  'Wide Backgrounds': [45, 55, 60, 42, 48, 58, 92],
};
const controls = document.querySelector<HTMLDivElement>('#controls')!;
const presetEl = document.querySelector<HTMLSelectElement>('#preset')!;
const power = document.querySelector<HTMLButtonElement>('#power')!;
const fileEl = document.querySelector<HTMLInputElement>('#audioFile')!;
const play = document.querySelector<HTMLButtonElement>('#play')!;
const exportBtn = document.querySelector<HTMLButtonElement>('#export')!;
const mixEl = document.querySelector<HTMLInputElement>('#mix')!;
const outputEl = document.querySelector<HTMLInputElement>('#output')!;
let values = presets['Clean & Natural'].slice();
let ctx: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;
let buffer: AudioBuffer | null = null;
let startedAt = 0;
let offset = 0;
let playing = false;
let enabled = true;
let dry: GainNode, wet: GainNode, low: BiquadFilterNode, presence: BiquadFilterNode, air: BiquadFilterNode, comp: DynamicsCompressorNode, warmth: WaveShaperNode, spaceSend: GainNode, delay: DelayNode, feedback: GainNode, widthSend: GainNode, widthDelay: DelayNode, widthPanL: StereoPannerNode, widthPanR: StereoPannerNode, output: GainNode, limiter: DynamicsCompressorNode, analyser: AnalyserNode;

function makeCurve(amount:number){
  const n=1024, curve=new Float32Array(n), k=amount*8;
  for(let i=0;i<n;i++){const x=i*2/n-1;curve[i]=((1+k)*x)/(1+k*Math.abs(x));}
  return curve;
}
function initAudio(){
  if(ctx) return;
  ctx=new AudioContext();
  dry=ctx.createGain(); wet=ctx.createGain(); low=ctx.createBiquadFilter(); presence=ctx.createBiquadFilter(); air=ctx.createBiquadFilter(); comp=ctx.createDynamicsCompressor(); warmth=ctx.createWaveShaper(); spaceSend=ctx.createGain(); delay=ctx.createDelay(1); feedback=ctx.createGain(); widthSend=ctx.createGain(); widthDelay=ctx.createDelay(.03); widthPanL=ctx.createStereoPanner(); widthPanR=ctx.createStereoPanner(); output=ctx.createGain(); limiter=ctx.createDynamicsCompressor(); analyser=ctx.createAnalyser(); analyser.fftSize=256;
  low.type='highpass'; presence.type='peaking'; presence.frequency.value=3200; presence.Q.value=.7; air.type='highshelf'; air.frequency.value=9000;
  wet.connect(low); low.connect(comp); comp.connect(presence); presence.connect(air); air.connect(warmth); warmth.connect(output); warmth.connect(spaceSend); spaceSend.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(output); warmth.connect(widthSend); widthSend.connect(widthPanL); widthSend.connect(widthDelay); widthDelay.connect(widthPanR); widthPanL.connect(output); widthPanR.connect(output); widthPanL.pan.value=-.85; widthPanR.pan.value=.85; widthDelay.delayTime.value=.012; dry.connect(output); output.connect(limiter); limiter.threshold.value=-1; limiter.knee.value=0; limiter.ratio.value=20; limiter.attack.value=.003; limiter.release.value=.08; limiter.connect(analyser); analyser.connect(ctx.destination);
  updateAudio();
}
function updateAudio(){
  if(!ctx) return;
  const [clean,tight,smooth,warm,airV,space,width]=values;
  low.frequency.value=55+clean*1.05;
  comp.threshold.value=-12-tight*.16; comp.ratio.value=1.5+tight*.045; comp.attack.value=.012+smooth*.00035; comp.release.value=.08+smooth*.0022;
  presence.gain.value=(50-smooth)*.045 + clean*.018;
  air.gain.value=(airV-35)*.095;
  warmth.curve=makeCurve(warm/100); warmth.oversample='2x';
  delay.delayTime.value=.055+space*.0019; feedback.gain.value=Math.min(.24,space*.0022); spaceSend.gain.value=space/100*.34;
  widthSend.gain.value=width/100*.22; widthDelay.delayTime.value=.007+(width/100)*.009;
  const mix=enabled?Number(mixEl.value)/100:0; const theta=mix*Math.PI/2; wet.gain.value=enabled?Math.sin(theta):0; dry.gain.value=enabled?Math.cos(theta):1;
  output.gain.value=Math.pow(10,Number(outputEl.value)/20);
}
function audioBufferToWav(audio:AudioBuffer){
  const channels=audio.numberOfChannels, frames=audio.length, bytes=44+frames*channels*2;
  const ab=new ArrayBuffer(bytes), v=new DataView(ab); let p=0;
  const str=(x:string)=>{for(let i=0;i<x.length;i++)v.setUint8(p++,x.charCodeAt(i));};
  str('RIFF');v.setUint32(p,bytes-8,true);p+=4;str('WAVE');str('fmt ');v.setUint32(p,16,true);p+=4;v.setUint16(p,1,true);p+=2;v.setUint16(p,channels,true);p+=2;v.setUint32(p,audio.sampleRate,true);p+=4;v.setUint32(p,audio.sampleRate*channels*2,true);p+=4;v.setUint16(p,channels*2,true);p+=2;v.setUint16(p,16,true);p+=2;str('data');v.setUint32(p,frames*channels*2,true);p+=4;
  for(let i=0;i<frames;i++)for(let c=0;c<channels;c++){const x=Math.max(-1,Math.min(1,audio.getChannelData(c)[i]));v.setInt16(p,x<0?x*32768:x*32767,true);p+=2;}
  return new Blob([ab],{type:'audio/wav'});
}
async function exportWav(){
  if(!buffer)return;
  exportBtn.disabled=true; const old=exportBtn.textContent; exportBtn.textContent='RENDERING…';
  try{
    const rate=buffer.sampleRate, length=Math.ceil((buffer.duration+1.25)*rate), oc=new OfflineAudioContext(2,length,rate);
    const src=oc.createBufferSource();src.buffer=buffer; const d=oc.createGain(),w=oc.createGain(),hp=oc.createBiquadFilter(),pr=oc.createBiquadFilter(),ar=oc.createBiquadFilter(),co=oc.createDynamicsCompressor(),wa=oc.createWaveShaper(),ss=oc.createGain(),de=oc.createDelay(1),fb=oc.createGain(),ws=oc.createGain(),wd=oc.createDelay(.03),pl=oc.createStereoPanner(),prr=oc.createStereoPanner(),out=oc.createGain(),lim=oc.createDynamicsCompressor();
    const [clean,tight,smooth,warm,airV,space,width]=values; hp.type='highpass';hp.frequency.value=55+clean*1.05;pr.type='peaking';pr.frequency.value=3200;pr.Q.value=.7;pr.gain.value=(50-smooth)*.045+clean*.018;ar.type='highshelf';ar.frequency.value=9000;ar.gain.value=(airV-35)*.095;co.threshold.value=-12-tight*.16;co.ratio.value=1.5+tight*.045;co.attack.value=.012+smooth*.00035;co.release.value=.08+smooth*.0022;wa.curve=makeCurve(warm/100);wa.oversample='2x';de.delayTime.value=.055+space*.0019;fb.gain.value=Math.min(.24,space*.0022);ss.gain.value=space/100*.34;ws.gain.value=width/100*.22;wd.delayTime.value=.007+(width/100)*.009;pl.pan.value=-.85;prr.pan.value=.85;
    const mix=enabled?Number(mixEl.value)/100:0,theta=mix*Math.PI/2;w.gain.value=enabled?Math.sin(theta):0;d.gain.value=enabled?Math.cos(theta):1;out.gain.value=Math.pow(10,Number(outputEl.value)/20);lim.threshold.value=-1;lim.knee.value=0;lim.ratio.value=20;lim.attack.value=.003;lim.release.value=.08;
    src.connect(d);src.connect(w);w.connect(hp);hp.connect(co);co.connect(pr);pr.connect(ar);ar.connect(wa);wa.connect(out);wa.connect(ss);ss.connect(de);de.connect(fb);fb.connect(de);de.connect(out);wa.connect(ws);ws.connect(pl);ws.connect(wd);wd.connect(prr);pl.connect(out);prr.connect(out);d.connect(out);out.connect(lim);lim.connect(oc.destination);src.start();
    const rendered=await oc.startRendering(),blob=audioBufferToWav(rendered),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(fileEl.files?.[0]?.name.replace(/\.[^.]+$/,'')||'vocal')+'-Vocal-Finish.wav';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);document.querySelector('.note')!.textContent='Export complete • WAV saved with current Vocal Finish settings';
  }catch(e){console.error(e);document.querySelector('.note')!.textContent='Export failed • your original vocal is safe';}
  finally{exportBtn.disabled=false;exportBtn.textContent=old;}
}
function draw(){
  controls.innerHTML='';
  names.forEach((name,i)=>{
    const wrap=document.createElement('div'); wrap.className='control';
    wrap.innerHTML='<div class="knob" role="slider" aria-label="'+name+'" tabindex="0"></div><label>'+name+'</label><div class="value">'+values[i]+'%</div>';
    const knob=wrap.querySelector<HTMLDivElement>('.knob')!; knob.style.setProperty('--v',String(values[i]));
    const set=(v:number)=>{values[i]=Math.round(Math.max(0,Math.min(100,v)));knob.style.setProperty('--v',String(values[i]));wrap.querySelector('.value')!.textContent=values[i]+'%';knob.setAttribute('aria-valuenow',String(values[i]));updateAudio();};
    let dragging=false,startY=0,startValue=0;
    knob.addEventListener('pointerdown',e=>{dragging=true;startY=e.clientY;startValue=values[i];knob.setPointerCapture(e.pointerId);e.preventDefault();});
    knob.addEventListener('pointermove',e=>{if(!dragging)return;set(startValue+(startY-e.clientY)*0.75);});
    const endDrag=(e:PointerEvent)=>{if(!dragging)return;dragging=false;try{knob.releasePointerCapture(e.pointerId);}catch{}};
    knob.addEventListener('pointerup',endDrag); knob.addEventListener('pointercancel',endDrag);
    knob.addEventListener('wheel',e=>{e.preventDefault();set(values[i]+(e.deltaY<0?2:-2));},{passive:false});
    knob.addEventListener('dblclick',()=>set(presets[presetEl.value][i]));
    knob.addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowRight'){e.preventDefault();set(values[i]+2);}if(e.key==='ArrowDown'||e.key==='ArrowLeft'){e.preventDefault();set(values[i]-2);}});
    controls.appendChild(wrap);
  });
}
function stop(){
  if(source){try{source.stop();}catch{} source.disconnect(); source=null;}
  if(playing&&ctx) offset=Math.min(buffer?.duration||0,offset+(ctx.currentTime-startedAt));
  playing=false; play.textContent='▶ PLAY';
}
async function start(){
  if(!buffer||!ctx) return;
  if(ctx.state==='suspended') await ctx.resume();
  if(offset>=buffer.duration) offset=0;
  source=ctx.createBufferSource(); source.buffer=buffer; source.connect(dry); source.connect(wet); source.onended=()=>{if(playing){playing=false;offset=0;play.textContent='▶ PLAY';}};
  source.start(0,offset); startedAt=ctx.currentTime; playing=true; play.textContent='❚❚ PAUSE';
}
draw();
exportBtn.addEventListener('click',exportWav);
document.querySelector('#load')!.addEventListener('click',()=>fileEl.click());
fileEl.addEventListener('change',async()=>{const f=fileEl.files?.[0];if(!f)return;try{initAudio();await ctx!.resume();stop();const bytes=await f.arrayBuffer();buffer=await ctx!.decodeAudioData(bytes.slice(0));offset=0;document.querySelector('#trackName')!.textContent=f.name;play.disabled=false;exportBtn.disabled=false;document.querySelector('.note')!.textContent='Audio loaded • press PLAY to test processing';document.querySelector('.note')!.classList.add('ready');}catch(err){console.error(err);buffer=null;play.disabled=true;exportBtn.disabled=true;document.querySelector('.note')!.textContent='Could not decode that file • try WAV, MP3, M4A, or AAC';}});
play.addEventListener('click',async()=>{initAudio();await ctx!.resume();playing?stop():await start();});
presetEl.addEventListener('change',()=>{values=presets[presetEl.value].slice();draw();updateAudio();});
document.querySelector('#reset')!.addEventListener('click',()=>{values=presets['Clean & Natural'].slice();presetEl.value='Clean & Natural';mixEl.value='100';outputEl.value='0';document.querySelector('#mixValue')!.textContent='100%';document.querySelector('#outputValue')!.textContent='0 dB';draw();updateAudio();});
power.addEventListener('click',()=>{enabled=!enabled;power.classList.toggle('on',enabled);power.classList.toggle('off',!enabled);updateAudio();});
mixEl.addEventListener('input',()=>{document.querySelector('#mixValue')!.textContent=mixEl.value+'%';updateAudio();});
outputEl.addEventListener('input',()=>{document.querySelector('#outputValue')!.textContent=outputEl.value+' dB';updateAudio();});
setInterval(()=>{if(!buffer)return;const current=playing&&ctx?Math.min(buffer.duration,offset+ctx.currentTime-startedAt):offset;const fmt=(s:number)=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');document.querySelector('#time')!.textContent=fmt(current)+' / '+fmt(buffer.duration);const meter=document.querySelector<HTMLElement>('#inputMeter')!; if(playing&&ctx&&analyser){const data=new Uint8Array(analyser.frequencyBinCount);analyser.getByteTimeDomainData(data);let sum=0;for(const x of data){const v=(x-128)/128;sum+=v*v;}const rms=Math.sqrt(sum/data.length);meter.style.width=Math.min(100,Math.max(8,rms*240))+'%';}else meter.style.width='8%';},150);
