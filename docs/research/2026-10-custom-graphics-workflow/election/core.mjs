// Research-only loader: imports current product functions without modifying product code.
import {rolldown} from 'rolldown';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const entry=`export * from '${root}src/model/productionData.ts'; export {parseDefinition} from '${root}src/model/spxDefinition.ts'; export {composeDocument} from '${root}src/preview/composeDocument.ts'; export {publishGate} from '${root}src/validation/publishGate.ts'; export {setFieldValueJs} from '${root}src/templates/shared/base.ts';`;
const bundle=await rolldown({input:'research-entry',plugins:[{name:'research-loader',resolveId(id){if(id==='research-entry')return '\0research-entry';},async load(id){if(id==='\0research-entry')return entry;if(id.endsWith('?raw'))return 'export default '+JSON.stringify(await readFile(id.slice(0,-4),'utf8'))+';';}}]});
const result=await bundle.generate({format:'esm'});
await bundle.close();
export default await import('data:text/javascript;base64,'+Buffer.from(result.output[0].code).toString('base64'));
