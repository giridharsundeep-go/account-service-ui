#!/usr/bin/env node
/** Generate published SVGs from the same source the Apps menu renders. No image dependencies. */
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {appLogoSvg} from './brand.js';
const ids={
 'greatley-poshley-support-ui':'support',
 'account-service-ui':'professy','chatly-ui':'chatly','greatley-poshley-auth-ui':'identity',
 'greatley-poshley-calendar-ui':'calendar','greatley-poshley-docs-ui':'documents',
 'greatley-poshley-forge-ui':'forge','greatley-poshley-instru-ui':'instru',
 'greatley-poshley-mail-ui':'mail','greatley-poshley-meetings-ui':'meetings',
 'greatley-poshley-sheets-ui':'sheets','greatley-poshley-slides-ui':'slides'
};
const app=resolve(process.argv[2]||process.cwd()),id=ids[basename(app)];
if(!id)throw new Error('Run brand sync from a Greatley Poshley app root.');
const output=resolve(app,'src/assets/brand');
await mkdir(output,{recursive:true});
await Promise.all([['rainbow-seven','company'],[id,id]].map(([name,key])=>writeFile(resolve(output,name+'.svg'),appLogoSvg(key))));
console.log('Brand assets synchronized: '+id);
