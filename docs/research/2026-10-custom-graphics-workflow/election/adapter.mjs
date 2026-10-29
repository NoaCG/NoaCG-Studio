// Research fixture adapter, deliberately not a 2027 provider integration.
import fs from 'node:fs/promises';
const read=async name=>JSON.parse(await fs.readFile(new URL('fixtures/'+name,import.meta.url),'utf8'));
async function csv(name){const text=await fs.readFile(new URL('fixtures/'+name,import.meta.url),'utf8');if(text.includes('"'))throw Error('Fixture CSV excludes quoted cells; use a full CSV reader for a provider');const [header,...lines]=text.trim().split(/\r?\n/).map(l=>l.split(','));return lines.map(row=>{if(row.length!==header.length)throw Error('CSV column count');return Object.fromEntries(header.map((h,i)=>[h,row[i]]));});}
const [partyRoster,candidateRoster,assets]=await Promise.all([csv('parties.csv'),csv('candidates.csv'),read('assets.json')]);
const byId=(rows,key)=>Object.fromEntries(rows.map(row=>[row[key],row]));
const parties=byId(partyRoster,'party_id'),candidates=byId(candidateRoster,'candidate_id');
function unique(rows,key){if(!Array.isArray(rows)||new Set(rows.map(r=>r[key])).size!==rows.length)throw Error('Missing collection or duplicate '+key);}
function number(n,label){if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid '+label);return n;}
const text=n=>n.toLocaleString('en-GB');
export function normalize(s,previousRevision=0){
  if(s.fixture!==true||s.election_id!=='FI2027_DEMO')throw Error('Not this rehearsal election');
  if(!Number.isSafeInteger(s.revision)||s.revision<previousRevision)throw Error('Out-of-order revision');
  if(typeof s.status!=='string'||typeof s.observed_at!=='string'||!Number.isFinite(Date.parse(s.observed_at)))throw Error('Missing status or timestamp');
  unique(s.parties,'party_id');unique(s.candidates,'candidate_id');
  if(s.parties.length!==partyRoster.length||s.candidates.length!==candidateRoster.length)throw Error('Incomplete full snapshot');
  const total=s.parties.reduce((n,p)=>n+number(p.votes,'votes'),0);
  const out={election:{summary:{status:s.status,observed_at:s.observed_at,revision:s.revision,reporting_text:`${number(s.reporting_units,'reporting units')} / ${number(s.total_units,'total units')}`},parties:{},candidates:{},headlines:s.headlines}};
  if(!s.total_units||s.reporting_units>s.total_units)throw Error('Invalid reporting denominator');
  if(!Array.isArray(s.headlines)||s.headlines.some(x=>typeof x!=='string'))throw Error('Malformed headlines');
  // Explicit empty string, not [] or null: this is how current bindings clear a list.
  out.election.headlines=s.headlines.length?s.headlines:'';
  for(const p of s.parties){const r=parties[p.party_id];if(!r)throw Error('Unknown party');const asset=assets[r.logo_asset];if(!asset?.data.startsWith('data:image/svg+xml;base64,'))throw Error('Unresolved approved asset');out.election.parties[p.party_id]={label:p.party_id,votes:p.votes,votes_text:text(p.votes),share_text:total?(100*p.votes/total).toFixed(1):'—',seats_text:String(number(p.projected_seats,'projected seats')),logo:asset.data};}
  for(const c of s.candidates){if(!candidates[c.candidate_id])throw Error('Unknown candidate');if(typeof c.status!=='string')throw Error('Missing candidate status');out.election.candidates[c.candidate_id]={votes:number(c.votes,'candidate votes'),votes_text:text(c.votes),status:c.status};}
  return out;
}
export {read};
