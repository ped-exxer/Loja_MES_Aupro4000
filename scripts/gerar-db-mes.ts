// Gera docs/clp/MES.db (fonte do DB MES para o TIA Portal) a partir de packages/contrato-clp.
//   npm run db-mes

import { writeFileSync, mkdirSync } from 'node:fs';
import { fonteDbTia } from '../packages/contrato-clp/src/index.ts';

mkdirSync('docs/clp', { recursive: true });
writeFileSync('docs/clp/MES.db', fonteDbTia());
console.log('docs/clp/MES.db gerado');
