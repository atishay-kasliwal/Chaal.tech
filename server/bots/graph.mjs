/**
 * A decision graph: named, pure nodes run in order over one scratch object. The same definition
 * runs the bot, draws the Mermaid diagram, and (with a recorded trace's path) highlights the route
 * one decision took. Synchronous and dependency-free so it runs unchanged in the Worker.
 *
 * A node is { id, label, run(scratch) }. `run` may set `scratch.done = true` to finish early (a
 * forced move needs no personality). The runner records every node it ran, in order.
 */

export function defineGraph(id, nodes) {
	const ids = new Set();
	for (const node of nodes) {
		if (!node.id || typeof node.run !== 'function') throw new Error(`Bad node in ${id}`);
		if (ids.has(node.id)) throw new Error(`Duplicate node ${node.id} in ${id}`);
		ids.add(node.id);
	}
	return Object.freeze({ id, nodes: Object.freeze([...nodes]) });
}

export function runGraph(graph, scratch) {
	const path = [];
	for (const node of graph.nodes) {
		path.push(node.id);
		node.run(scratch);
		if (scratch.done) break;
	}
	scratch.path = path;
	return scratch;
}

/** Mermaid flowchart of the graph; nodes on `path` are highlighted. */
export function toMermaid(graph, path = null) {
	const visited = new Set(path ?? []);
	const lines = ['flowchart TD'];
	graph.nodes.forEach((node, i) => {
		lines.push(`  ${node.id}["${node.id}: ${node.label ?? ''}"]`);
		if (i > 0) lines.push(`  ${graph.nodes[i - 1].id} --> ${node.id}`);
	});
	if (path) {
		lines.push('  classDef visited fill:#2f9fa8,stroke:#1f4d5c,color:#fff');
		for (const id of visited) lines.push(`  class ${id} visited`);
	}
	return lines.join('\n');
}
