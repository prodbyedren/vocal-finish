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
let dry: GainNode, wet: GainNode, low: BiquadFilterNode, presence: BiquadFilterNode, air: BiquadFilterNode, comp: DynamicsCompressorNode, warmth: WaveShaperNode, delay: DelayNode, feedback: GainNode, output: GainNode;

function makeCurve(amount:number){
  const n=1024, curve=new Float32Array(n), k=amount*8;
  for(let i=0;i<n;i++){const x=i*2/n-1;curve[i]=((1+k)*x)/(1+k*Math.abs(x));}
  return curve;
}
function initAudio(){
  if(ctx) return;
  ctx=new AudioContext();
  dry=ctx.createGain(); wet=ctx.createGain(); low=ctx.createBiquadFilter(); presence=ctx.createBiquadFilter(); air=ctx.createBiquadFilter(); comp=ctx.createDynamicsCompressor(); warmth=ctx.createWaveShaper(); delay=ctx.createDelay(1); feedback=ctx.createGain(); output=ctx.createGain();
  low.type='highpass'; presence.type='peaking'; presence.frequency.value=3200; presence.Q.value=.7; air.type='highshelf'; air.frequency.value=9000;
  wet.connect(low); low.connect(comp); comp.connect(presence); presence.connect(air); air.connect(warmth); warmth.connect(output); warmth.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(output); dry.connect(output); output.connect(ctx.destination);
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
  delay.delayTime.value=.045+space*.0022; feedback.gain.value=Math.min(.32,space*.0027);
  const mix=enabled?Number(mixEl.value)/100:0; wet.gain.value=mix; dry.gain.value=1-mix*.68;
  output.gain.value=Math.pow(10,Number(outputEl.value)/20);
  void width;
}
function draw(){
  controls.innerHTML='';
  names.forEach((name,i)=>{
    const wrap=document.createElement('div'); wrap.className='control';
    wrap.innerHTML='<div class="knob" role="slider" aria-label="'+name+'" tabindex="0"></div><label>'+name+'</label><div class="value">'+values[i]+'%</div>';
    const knob=wrap.querySelector<HTMLDivElement>('.knob')!; knob.style.setProperty('--v',String(values[i]));
    const set=(v:number)=>{values[i]=Math.max(0,Math.min(100,v));knob.style.setProperty('--v',String(values[i]));wrap.querySelector('.value')!.textContent=values[i]+'%';updateAudio();};
    knob.addEventListener('wheel',e=>{e.preventDefault();set(values[i]+(e.deltaY<0?2:-2));});
    knob.addEventListener('click',()=>set(values[i]>=100?0:values[i]+10));
    knob.addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowRight')set(values[i]+2);if(e.key==='ArrowDown'||e.key==='ArrowLeft')set(values[i]-2);});
    controls.appendChild(wrap);
  });
}
function stop(){
  if(source){try{source.stop();}catch{} source.disconnect(); source=null;}
  if(playing&&ctx) offset=Math.min(buffer?.duration||0,offset+(ctx.currentTime-startedAt));
  playing=false; play.textContent='▶ PLAY';
}
function start(){
  if(!buffer||!ctx) return;
  if(offset>=buffer.duration) offset=0;
  source=ctx.createBufferSource(); source.buffer=buffer; source.connect(dry); source.connect(wet); source.onended=()=>{if(playing){playing=false;offset=0;play.textContent='▶ PLAY';}};
  source.start(0,offset); startedAt=ctx.currentTime; playing=true; play.textContent='❚❚ PAUSE';
}
draw();
document.querySelector('#load')!.addEventListener('click',()=>fileEl.click());
fileEl.addEventListener('change',async()=>{const f=fileEl.files?.[0];if(!f)return;initAudio();await ctx!.resume();stop();buffer=await ctx!.decodeAudioData(await f.arrayBuffer());offset=0;document.querySelector('#trackName')!.textContent=f.name;play.disabled=false;document.querySelector('.note')!.textContent='Audio engine active • use headphones while comparing presets';document.querySelector('.note')!.classList.add('ready');});
play.addEventListener('click',async()=>{initAudio();await ctx!.resume();playing?stop():start();});
presetEl.addEventListener('change',()=>{values=presets[presetEl.value].slice();draw();updateAudio();});
document.querySelector('#reset')!.addEventListener('click',()=>{values=presets['Clean & Natural'].slice();presetEl.value='Clean & Natural';mixEl.value='100';outputEl.value='0';document.querySelector('#mixValue')!.textContent='100%';document.querySelector('#outputValue')!.textContent='0 dB';draw();updateAudio();});
power.addEventListener('click',()=>{enabled=!enabled;power.classList.toggle('on',enabled);power.classList.toggle('off',!enabled);updateAudio();});
mixEl.addEventListener('input',()=>{document.querySelector('#mixValue')!.textContent=mixEl.value+'%';updateAudio();});
outputEl.addEventListener('input',()=>{document.querySelector('#outputValue')!.textContent=outputEl.value+' dB';updateAudio();});
setInterval(()=>{if(!buffer)return;const current=playing&&ctx?Math.min(buffer.duration,offset+ctx.currentTime-startedAt):offset;const fmt=(s:number)=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');document.querySelector('#time')!.textContent=fmt(current)+' / '+fmt(buffer.duration);document.querySelector<HTMLElement>('#inputMeter')!.style.width=(playing?45+Math.random()*45:8)+'%';},150);
