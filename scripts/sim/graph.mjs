/**
 * Print the character decision graph as Mermaid, from the graph definition the bots run.
 *   node scripts/sim/graph.mjs [--path perceive,assess,...]   highlight a recorded trace's path
 */
import { CHARACTER_GRAPH } from '../../server/bots/character.mjs';
import { toMermaid } from '../../server/bots/graph.mjs';

const i = process.argv.indexOf('--path');
console.log(toMermaid(CHARACTER_GRAPH, i > 0 ? process.argv[i + 1].split(',') : null));
